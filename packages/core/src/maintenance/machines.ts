import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { machines, maintenanceOrders, type DbOrTx } from '@plantero/db';
import { NotFoundError } from '../auth/errors.js';

const OPEN_ORDER_STATUSES = ['reported', 'planned', 'in_progress', 'waiting_parts'] as const;

/**
 * Makine kartları — okuma/tarama yardımcıları (docs/modules/bakim.md §1, §3).
 * Yazma (durum geçişleri) `maintenance/orders.ts`/`maintenance/plans.ts` içinde, ilgili iş emri
 * geçişiyle birlikte yapılır — burada makinenin kendi başına bir "tek yazma noktası" olmasına
 * gerek yok (stok/muhasebe gibi dış sonucu olan bir defter değil, düz durum alanı).
 */

export type MachineRow = typeof machines.$inferSelect;

/** Mobil arıza bildirimi formundaki QR/barkod okutması `MCH:<code>` biçimindedir. */
export const MACHINE_SCAN_PREFIX = 'MCH:';

/** `MCH:MK-008` ya da doğrudan `MK-008` → `MK-008` (boşluk kırpılır, büyük harfe çevrilmez —
 *  makine kodları zaten büyük harf üretilir ama elle girişte kullanıcı küçük yazarsa yine eşleşsin
 *  diye karşılaştırma `findMachineByScan` içinde case-insensitive yapılır). */
export function parseMachineScanCode(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.toUpperCase().startsWith(MACHINE_SCAN_PREFIX) ? trimmed.slice(MACHINE_SCAN_PREFIX.length).trim() : trimmed;
}

/** QR/barkod okutması ya da elle girilen makine koduyla makineyi bulur. */
export async function findMachineByScan(tx: DbOrTx, rawCode: string): Promise<MachineRow> {
  const code = parseMachineScanCode(rawCode);
  const rows = await tx.select().from(machines).where(eq(machines.isActive, true));
  const found = rows.find((m) => m.code.toLowerCase() === code.toLowerCase());
  if (!found) throw new NotFoundError('Makine', code);
  return found;
}

export type MtbfMttr = {
  /** Ortalama arızalar arası süre (saat) — ardışık arıza bildirimleri arasındaki fark. En az 2 arıza gerekir. */
  mtbfHours: number | null;
  /** Ortalama onarım süresi (saat) — tamamlanmış arızi iş emirlerinin duruş süresi ortalaması. */
  mttrHours: number | null;
  failureCount: number;
};

/**
 * MTBF/MTTR — yalnızca `kind='corrective'` (arıza) iş emirlerinden hesaplanır (periyodik bakım
 * bir arıza değildir). MTBF ardışık `reportedAt` farklarının ortalamasıdır (klasik tanımın basite
 * indirgenmiş hâli — gerçek "çalışma süresi" toplamı yerine takvim süresi kullanılır, çünkü hat
 * bazında makine çalışma penceresi bu modülün kapsamında ayrıca izlenmiyor; bilinen basitleştirme).
 */
export async function computeMtbfMttr(tx: DbOrTx, machineId: string): Promise<MtbfMttr> {
  const rows = await tx
    .select({ reportedAt: maintenanceOrders.reportedAt, downtimeMinutes: maintenanceOrders.downtimeMinutes, status: maintenanceOrders.status })
    .from(maintenanceOrders)
    .where(and(eq(maintenanceOrders.machineId, machineId), eq(maintenanceOrders.kind, 'corrective')))
    .orderBy(asc(maintenanceOrders.reportedAt));

  const failureCount = rows.length;
  let mtbfHours: number | null = null;
  if (rows.length >= 2) {
    let totalMs = 0;
    for (let i = 1; i < rows.length; i++) totalMs += rows[i]!.reportedAt.getTime() - rows[i - 1]!.reportedAt.getTime();
    mtbfHours = totalMs / (rows.length - 1) / 3_600_000;
  }

  const done = rows.filter((r) => r.status === 'done' && r.downtimeMinutes > 0);
  const mttrHours = done.length > 0 ? done.reduce((a, r) => a + r.downtimeMinutes, 0) / done.length / 60 : null;

  return { mtbfHours, mttrHours, failureCount };
}

/** Aktif makineler — bakım rolü dışı ekranlarda da (ör. iş emri formu makine seçimi) kullanılır. */
export async function listActiveMachines(tx: DbOrTx): Promise<MachineRow[]> {
  return tx.select().from(machines).where(eq(machines.isActive, true)).orderBy(asc(machines.code));
}

/** Bir makinenin açık (done/cancelled dışı) bakım iş emri sayısı — "Tamamla"/"İptal" sonrası makine
 *  durumunu idle'a mı döndüreceğimizi yoksa başka bir açık iş emri yüzünden down/maintenance'ta mı
 *  bırakacağımızı belirler (`excludeOrderId`: az önce kapatılan/iptal edilen iş emrinin kendisi). */
export async function countOpenOrdersForMachine(tx: DbOrTx, machineId: string, excludeOrderId?: string): Promise<number> {
  const conds = [eq(maintenanceOrders.machineId, machineId), inArray(maintenanceOrders.status, OPEN_ORDER_STATUSES)];
  if (excludeOrderId) conds.push(ne(maintenanceOrders.id, excludeOrderId));
  const rows = await tx.select({ id: maintenanceOrders.id }).from(maintenanceOrders).where(and(...conds));
  return rows.length;
}
