import { and, eq, gte, inArray, like } from 'drizzle-orm';
import { notifications, roles, userRoles, type DbOrTx } from '@plantero/db';
import { getExpiryBuckets, type ExpiryBucket, type ExpiryRow } from '../stock/expiry.js';
import { D, round2, sum } from '../money.js';
import { notify } from './send.js';
import type { ActorCtx } from '../types.js';

/**
 * Sistem bildirimleri — docs/modules/bildirimler.md §3 ("SKT 30/60/90 uyarıları (depo + kalite rolleri)").
 *
 * Aşama-1'deki worker job'ı (`apps/worker/src/jobs/expiryAlerts.ts`, eski sürüm) `notifications`
 * tablosuna KULLANICISIZ (`user_id` NULL) ve lot BAŞINA satır yazıyordu: `/bildirimler` ve üst bar zili
 * yalnızca `user_id = ben` satırlarını listelediği için bu uyarılar hiçbir kullanıcıya ulaşmıyordu.
 * Bu servis tek yazma noktası `notify()` üzerinden (rol → kullanıcı çözümü orada) gerçek alıcılara yazar.
 *
 * Tasarım kararı — kova başına GÜNLÜK ÖZET, lot başına değil: taze seed'de bile 90 gün ufkunda ~80 lot
 * var; lot başına bildirim 2 rol kullanıcısı için günde 160 satır demek (gelen kutusunu anlamsızlaştırır).
 * Bunun yerine `stock/expiry.getExpiryBuckets` ile AYNI 30/60/90 kovaları (ExpiryBadge eşikleri) için kova
 * başına tek bildirim: lot sayısı, toplam stok değeri, ilk 5 lot ve `/depo/skt` bağlantısı. Kaynak
 * göstergesi `refTable='expiry_digest'` (refId yok — özet tek bir kayda bağlı değil).
 *
 * Tekrar koruması: aynı kullanıcı için aynı kova özeti son `dedupHours` (varsayılan 20 saat — günlük
 * 07:00 çalıştırmasıyla uyumlu) içinde yazılmışsa atlanır; seed ve worker aynı fonksiyonu çağırdığından
 * `db:seed` tekrarı da çift kayıt üretmez.
 */

export const EXPIRY_ALERT_ROLES = ['depo', 'kalite'] as const;

const BUCKET_META: Record<ExpiryBucket, { label: string; order: number }> = {
  expired: { label: 'SKT GEÇMİŞ', order: 0 },
  critical: { label: 'SKT KRİTİK (30 gün)', order: 1 },
  warning: { label: 'SKT UYARI (60 gün)', order: 2 },
  notice: { label: 'SKT BİLGİ (90 gün)', order: 3 },
};

export type ExpiryAlertOptions = {
  /** Varsayılan: şimdi (iş günü `businessDate` ile hesaplanır) */
  asOf?: Date;
  /** Aynı kova özetinin tekrar yazılmaması için pencere (saat). Varsayılan 20. */
  dedupHours?: number;
  /** Varsayılan: depo + kalite */
  roleCodes?: readonly string[];
};

export type ExpiryAlertResult = {
  lotsEvaluated: number;
  alertsCreated: number;
  skippedAsDuplicate: number;
  recipients: number;
  buckets: Record<ExpiryBucket, number>;
};

const fmtMoney = (v: ReturnType<typeof D>) => `₺${round2(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

// Tur 1 P1 bildirimler-04: `D(qty).toFixed(2)` nokta ondalık üretiyordu ("245.00 KG") ve aynı cümlede
// `fmtMoney` (virgül ondalık, "₺3.675,00") ile çakışıyordu. Miktar da aynı tr-TR ayracından geçer —
// `money.ts`'deki `formatQtyTr` gereksiz sıfırları atıyor (ör. "245") ve bu özet için "245,00" gibi
// sabit 2 ondalıklı bir görünüm isteniyor (tutarla aynı hizada okunur); bu yüzden burada aynı kalıpla
// (nokta→virgül, binlik nokta) ayrı, sabit-2-ondalıklı bir yardımcı tanımlanır.
const fmtQty = (v: ReturnType<typeof D>) => v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function digestBody(bucket: ExpiryBucket, rows: ExpiryRow[]): string {
  const total = sum(rows.map((r) => D(r.value)));
  const head = rows.slice(0, 5).map((r) => {
    const when = r.daysLeft < 0 ? `${Math.abs(r.daysLeft)} gün önce doldu` : r.daysLeft === 0 ? 'bugün doluyor' : `${r.daysLeft} gün kaldı`;
    return `${r.lotNo} · ${r.productName} (${when}, ${fmtQty(D(r.qty))} ${r.uomCode})`;
  });
  const more = rows.length > 5 ? ` … ve ${rows.length - 5} lot daha` : '';
  const verb = bucket === 'expired' ? 'son kullanma tarihi geçmiş' : 'son kullanma tarihi yaklaşan';
  return `${rows.length} lot, toplam stok değeri ${fmtMoney(total)} — ${verb}: ${head.join('; ')}${more}. FEFO panosunda inceleyin.`;
}

/** SKT 30/60/90 kova özetlerini depo + kalite rolündeki kullanıcılara `in_app` bildirim olarak yazar. */
export async function generateExpiryAlerts(tx: DbOrTx, ctx: ActorCtx, opts: ExpiryAlertOptions = {}): Promise<ExpiryAlertResult> {
  const roleCodes = [...(opts.roleCodes ?? EXPIRY_ALERT_ROLES)];
  const dedupHours = opts.dedupHours ?? 20;
  const { rows } = await getExpiryBuckets(tx, { asOf: opts.asOf });

  const result: ExpiryAlertResult = {
    lotsEvaluated: rows.length, alertsCreated: 0, skippedAsDuplicate: 0, recipients: 0,
    buckets: { expired: 0, critical: 0, warning: 0, notice: 0 },
  };

  // Alıcılar: rol → kullanıcı (notify ile aynı çözümleme; tekrar koruması kullanıcı bazında olduğu için burada da gerekir)
  const targets = await tx
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(roles.code, roleCodes));
  const userIds = [...new Set(targets.map((t) => t.userId))];
  result.recipients = userIds.length;
  if (userIds.length === 0 || rows.length === 0) return result;

  const since = new Date((opts.asOf ?? new Date()).getTime() - dedupHours * 3_600_000);
  const buckets = (Object.keys(BUCKET_META) as ExpiryBucket[]).sort((a, b) => BUCKET_META[a].order - BUCKET_META[b].order);

  for (const bucket of buckets) {
    const inBucket = rows.filter((r) => r.bucket === bucket);
    result.buckets[bucket] = inBucket.length;
    if (inBucket.length === 0) continue;

    const { label } = BUCKET_META[bucket];
    const recent = await tx
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(and(
        inArray(notifications.userId, userIds),
        eq(notifications.channel, 'in_app'),
        eq(notifications.refTable, 'expiry_digest'),
        like(notifications.title, `${label}:%`),
        gte(notifications.createdAt, since),
      ));
    const alreadyNotified = new Set(recent.map((r) => r.userId));
    const fresh = userIds.filter((u) => !alreadyNotified.has(u));
    result.skippedAsDuplicate += userIds.length - fresh.length;
    if (fresh.length === 0) continue;

    const res = await notify(tx, {
      userIds: fresh,
      title: `${label}: ${inBucket.length} lot`,
      body: digestBody(bucket, inBucket),
      href: '/depo/skt',
      channel: ['in_app'],
      refTable: 'expiry_digest',
    }, ctx);
    result.alertsCreated += res.ids.length;
  }

  return result;
}
