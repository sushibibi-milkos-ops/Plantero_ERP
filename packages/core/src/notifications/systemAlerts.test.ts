import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { notifications, roles, users, userRoles } from '@plantero/db';
import { generateExpiryAlerts } from './systemAlerts.js';
import { receiveRawHelper } from '../stock/__test-utils__.js';
import { withRollback, seedBase, ctx, daysFromNow, suffix } from '../__tests__/helpers.js';

async function userWithRole(tx: Parameters<Parameters<typeof withRollback>[0]>[0], roleCode: string) {
  await tx.insert(roles).values({ code: roleCode, name: roleCode }).onConflictDoNothing({ target: roles.code });
  const [role] = await tx.select().from(roles).where(eq(roles.code, roleCode)).limit(1);
  const s = suffix();
  const [u] = await tx.insert(users).values({ email: `${roleCode}-${s}@test.local`, fullName: `${roleCode} ${s}`, passwordHash: 'x' }).returning();
  await tx.insert(userRoles).values({ userId: u!.id, roleId: role!.id });
  return u!;
}

describe('notifications/systemAlerts — SKT kova özetleri', () => {
  it('kova başına tek bildirim, depo + kalite kullanıcılarına; tekrar çalıştırma çift kayıt üretmez', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      // Test kullanıcıları benzersiz rol kodlarıyla — seed'deki gerçek depo/kalite kullanıcılarından bağımsız
      const rDepo = `depo_${b.s}`;
      const rKalite = `kalite_${b.s}`;
      const depo = await userWithRole(tx, rDepo);
      const kalite = await userWithRole(tx, rKalite);
      await receiveRawHelper(tx, b, 'SA-EXP', '10', '10', { expiryDate: daysFromNow(-2), toLocationId: b.loc.hamR01.id, status: 'released' });
      await receiveRawHelper(tx, b, 'SA-CRIT-1', '10', '10', { expiryDate: daysFromNow(10), toLocationId: b.loc.hamR01.id, status: 'released' });
      await receiveRawHelper(tx, b, 'SA-CRIT-2', '10', '10', { expiryDate: daysFromNow(20), toLocationId: b.loc.hamR01.id, status: 'released' });
      await receiveRawHelper(tx, b, 'SA-FAR', '10', '10', { expiryDate: daysFromNow(200), toLocationId: b.loc.hamR01.id, status: 'released' });

      const first = await generateExpiryAlerts(tx, ctx, { roleCodes: [rDepo, rKalite] });
      expect(first.recipients).toBe(2);
      // Seed verisi de DB'de olabilir — lot sayıları en az test lotları kadar
      expect(first.buckets.expired).toBeGreaterThanOrEqual(1);
      expect(first.buckets.critical).toBeGreaterThanOrEqual(2);
      const bucketsHit = Object.values(first.buckets).filter((n) => n > 0).length;
      expect(first.alertsCreated).toBe(bucketsHit * 2);

      for (const u of [depo, kalite]) {
        const mine = await tx.select().from(notifications).where(and(eq(notifications.userId, u.id), eq(notifications.refTable, 'expiry_digest')));
        expect(mine).toHaveLength(bucketsHit);
        const crit = mine.find((n) => n.title.startsWith('SKT KRİTİK'));
        expect(crit).toBeDefined();
        expect(crit!.status).toBe('sent'); // in_app anında okunabilir
        expect(crit!.href).toBe('/depo/skt');
        // Seed verisiyle dolu DB'de ilk 5 lot listesi test lotlarını içermeyebilir — başlıktaki sayı doğrulanır
        expect(Number(/: (\d+) lot$/.exec(crit!.title)?.[1])).toBe(first.buckets.critical);
        expect(crit!.body).toMatch(/^\d+ lot, toplam stok değeri ₺/);
        const exp = mine.find((n) => n.title.startsWith('SKT GEÇMİŞ'));
        expect(Number(/: (\d+) lot$/.exec(exp!.title)?.[1])).toBe(first.buckets.expired);
        expect(mine.some((n) => n.body.includes('SA-FAR'))).toBe(false); // 200 gün > 90 ufku
      }

      const second = await generateExpiryAlerts(tx, ctx, { roleCodes: [rDepo, rKalite] });
      expect(second.alertsCreated).toBe(0);
      expect(second.skippedAsDuplicate).toBe(bucketsHit * 2);
    });
  });

  it('alıcı rolünde kullanıcı yoksa hiçbir şey yazmaz', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      await receiveRawHelper(tx, b, 'SA-NOBODY', '10', '10', { expiryDate: daysFromNow(5), toLocationId: b.loc.hamR01.id, status: 'released' });
      const res = await generateExpiryAlerts(tx, ctx, { roleCodes: [`yok_${b.s}`] });
      expect(res.recipients).toBe(0);
      expect(res.alertsCreated).toBe(0);
    });
  });
});
