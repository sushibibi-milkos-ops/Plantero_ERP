import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { machines, productionLines, products, users, warehouses } from '../schema/index.js';
import {
  D, toDb, sum, SYSTEM_ACTOR, businessDate, addDays,
} from '@plantero/core';
import { createPlan, generateOrderForPlan } from '@plantero/core/maintenance/plans';
import { reportBreakdown, startOrder, completeOrder } from '@plantero/core/maintenance/orders';
import { recomputeOeeForRange } from '@plantero/core/maintenance/oee';
import { log, type SeedSummary } from './_helpers.js';

/**
 * Bakım modülü seed'i — docs/modules/bakim.md §Seed.
 * Makine kartları `docs/PRODUCTION-LINES.md` tablosundan BİREBİR (36 satır, MK-001…MK-036); hat
 * ataması/kategori/güç kolonları aynen taşınır. `machines` doğrudan upsert edilir (bir "tek yazma
 * noktası" ledger'ı değil, düz durum tablosu — stok/muhasebe kuralı burayı kapsamaz). Plan/iş emri/OEE
 * ise TAMAMEN `@plantero/core/maintenance/*` servisleri üzerinden üretilir (elle insert yok); her
 * servis kendi audit satırını zaten yazar.
 *
 * Zamanlama kararı: 6 iş emrinin tümü BUGÜN'e (saat farklarıyla) yerleştirilir — geçmiş güne
 * `reportedAt`/`scheduledFor` backdate'i `reportBreakdown`/`generateOrderForPlan`'ın şu anki
 * imzasında yok (yalnızca `startOrder`/`completeOrder` bir `asOf` alır) ve bu iki fonksiyonu salt
 * seed'in kozmetik geçmiş tarihi için genişletmek gerekçesiz bir servis değişikliği olurdu. Kabul
 * kriteri zaten "bugünün OEE'si" üzerinden tanımlı (§Kabul) — bu yüzden gerçek etki bugüne düşer.
 */

const TOTAL_EQUIPMENT_VALUE = D('4544474.99'); // rapor: makine-teçhizat toplam değeri

type MachineDef = {
  code: string; name: string; category: string; lineCode: string | null; powerKw: string | null; note: string;
};

/** docs/PRODUCTION-LINES.md "Makine kartları" tablosu — birebir. */
const MACHINE_DEFS: MachineDef[] = [
  { code: 'MK-001', name: 'Ön ezme (ezme makinesi, parçalama hazneli)', category: 'grinder', lineCode: 'HAT1', powerKw: '1', note: 'rapor: 28.93.17' },
  { code: 'MK-002', name: 'Püre makinesi (ball mill mikser)', category: 'mixer', lineCode: 'HAT1', powerKw: '5.5', note: 'rapor: 28.93.17' },
  { code: 'MK-003', name: 'Homogenizer', category: 'homogenizer', lineCode: 'HAT1', powerKw: null, note: 'kullanıcı beyanı' },
  { code: 'MK-004', name: 'Balans tankı (paslanmaz çelik tank, yan sıyırıcılı)', category: 'tank', lineCode: 'HAT1', powerKw: '0.5', note: 'rapor: 25.29.11' },
  { code: 'MK-005', name: 'Sıvı dolum makinesi 1 (YKM AYZ24)', category: 'filler', lineCode: 'HAT1', powerKw: '0.35', note: 'rapor: 28.29.21' },
  { code: 'MK-006', name: 'Sıvı dolum makinesi 2 (Sonkaya SMDY100Y)', category: 'filler', lineCode: 'HAT1', powerKw: null, note: 'rapor: 28.29.21' },
  { code: 'MK-007', name: 'Etiketleme makinesi (Sonkaya)', category: 'labeler', lineCode: 'HAT1', powerKw: '0.18', note: 'rapor' },
  { code: 'MK-008', name: 'Folyo kapatma / emniyet bandı (manuel indüksiyon)', category: 'sealer', lineCode: 'HAT1', powerKw: '0.6', note: 'rapor 99.99.99; ana veri EKP-URT-PKT-01 SONKAYA SEALER ile eşleşir' },
  { code: 'MK-009', name: 'Kodlama / tarih atma (Videojet inkjet)', category: 'coder', lineCode: 'HAT1', powerKw: null, note: 'rapor 26.20.16 — HAT1 ve HAT2 ortak' },
  { code: 'MK-010', name: 'İmalat kazanı (büyük kazan)', category: 'kettle', lineCode: 'HAT1', powerKw: '7.5', note: 'rapor' },
  { code: 'MK-011', name: 'Silindirik toz mikser 200 kg (HAT2)', category: 'mixer', lineCode: 'HAT2', powerKw: '5', note: 'rapor "750 litre silindirik toz ürün mikser"' },
  { code: 'MK-012', name: 'Dolum teknesi', category: 'hopper', lineCode: 'HAT2', powerKw: null, note: 'kullanıcı beyanı' },
  { code: 'MK-013', name: 'Toz karıştırıcı (protein tozu mikseri)', category: 'mixer', lineCode: 'HAT2', powerKw: '0.75', note: 'rapor 28.99.39' },
  { code: 'MK-014', name: 'Dikey toz dolum makinesi (otomatik)', category: 'filler', lineCode: 'HAT2', powerKw: '0.2', note: 'rapor' },
  { code: 'MK-015', name: 'Emniyet bandı kapatma (paketleme, Beta-Pak dolum ve kapatma)', category: 'sealer', lineCode: 'HAT2', powerKw: '15', note: 'rapor 28.29.21' },
  { code: 'MK-016', name: 'Silindirik toz mikser 200 kg (HAT3)', category: 'mixer', lineCode: 'HAT3', powerKw: null, note: 'kullanıcı beyanı (ikinci mikser)' },
  { code: 'MK-017', name: 'Elevatör 100 kg', category: 'conveyor', lineCode: 'HAT3', powerKw: null, note: 'kullanıcı beyanı' },
  { code: 'MK-018', name: 'Stick dolum makinesi (20 g)', category: 'filler', lineCode: 'HAT3', powerKw: null, note: 'kullanıcı beyanı' },
  { code: 'MK-019', name: 'Helezonlu götürücü (seyyar)', category: 'conveyor', lineCode: 'HAT3', powerKw: '2.2', note: 'rapor' },
  { code: 'MK-020', name: 'Shrink ambalaj makinesi (ısı tünelli)', category: 'packaging', lineCode: null, powerKw: '0.6', note: 'rapor — ortak' },
  { code: 'MK-021', name: 'Kuruyemiş kavurma makinesi', category: 'roaster', lineCode: 'HAT1', powerKw: '2.2', note: 'rapor' },
  { code: 'MK-022', name: 'Fermantasyon tankı 1.000 L (Kromel)', category: 'tank', lineCode: 'HAT1', powerKw: null, note: 'rapor' },
  { code: 'MK-023', name: 'Metal dedektörü (30×25)', category: 'inspection', lineCode: null, powerKw: '0.05', note: 'rapor — ortak' },
  { code: 'MK-024', name: 'Elek (tane boyut analizi)', category: 'inspection', lineCode: 'HAT2', powerKw: '0.3', note: 'rapor' },
  { code: 'MK-025', name: 'Nem tayin cihazı (Precisa)', category: 'lab', lineCode: null, powerKw: '0.1', note: 'rapor — ortak' },
  { code: 'MK-026', name: 'Hava kompresörü (pistonlu, seyyar)', category: 'utility', lineCode: null, powerKw: '3', note: 'rapor — ortak' },
  { code: 'MK-027', name: 'Sterilizasyon ünitesi (hijyen bariyeri)', category: 'utility', lineCode: null, powerKw: null, note: 'rapor — ortak' },
  { code: 'MK-028', name: 'Basınçlı yıkama makinesi', category: 'utility', lineCode: null, powerKw: '0.1', note: 'rapor — ortak' },
  { code: 'MK-029', name: 'Zemin temizleme makinesi (Taski Swingo)', category: 'utility', lineCode: null, powerKw: '0.5', note: 'rapor — ortak' },
  { code: 'MK-030', name: 'Akülü istif makinesi (Paftar ES1530E 1,5 t)', category: 'handling', lineCode: null, powerKw: null, note: 'rapor — depo' },
  { code: 'MK-031', name: 'Transpalet (manuel)', category: 'handling', lineCode: null, powerKw: null, note: 'rapor — depo' },
  { code: 'MK-032', name: 'Transpalet (manuel terazili)', category: 'handling', lineCode: null, powerKw: null, note: 'rapor — depo' },
  { code: 'MK-033', name: 'Kantar (elektronik)', category: 'scale', lineCode: null, powerKw: null, note: 'rapor — depo' },
  { code: 'MK-034', name: 'Elektronik terazi', category: 'scale', lineCode: null, powerKw: null, note: 'rapor — ortak' },
  { code: 'MK-035', name: 'Hassas terazi', category: 'lab', lineCode: null, powerKw: null, note: 'rapor — ortak' },
  { code: 'MK-036', name: 'Paslanmaz çelik çalışma tezgâhı (laboratuvar)', category: 'lab', lineCode: null, powerKw: null, note: 'rapor — ortak' },
];

/** Güç bilinmeyen ekipmanlar için varsayılan ağırlık (küçük/orta ekipman tahmini). */
const DEFAULT_WEIGHT = D('0.5');

async function tireWarehouseId(tx: DbOrTx): Promise<string> {
  const [row] = await tx.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.code, 'TIRE')).limit(1);
  if (!row) throw new Error('seed:maintenance — TIRE deposu bulunamadı');
  return row.id;
}

async function seedMachines(tx: DbOrTx, summary: SeedSummary): Promise<Map<string, typeof machines.$inferSelect>> {
  const lines = await tx.select().from(productionLines);
  const lineIdByCode = new Map(lines.map((l) => [l.code, l.id]));
  const warehouseId = await tireWarehouseId(tx);
  const [sealerProduct] = await tx.select().from(products).where(eq(products.shortCode, 'EKP-URT-PKT-01')).limit(1);

  // Oransal maliyet tahmini: ağırlık = powerKw (bilinmiyorsa DEFAULT_WEIGHT), toplam rapor değerine ölçeklenir.
  const weights = MACHINE_DEFS.map((m) => (m.powerKw ? D(m.powerKw) : DEFAULT_WEIGHT));
  const totalWeight = sum(weights);

  const byCode = new Map<string, typeof machines.$inferSelect>();
  for (let i = 0; i < MACHINE_DEFS.length; i++) {
    const def = MACHINE_DEFS[i]!;
    const purchaseCost = toDb(TOTAL_EQUIPMENT_VALUE.mul(weights[i]!).div(totalWeight));
    const [row] = await tx
      .insert(machines)
      .values({
        code: def.code, name: def.name, category: def.category, lineId: def.lineCode ? (lineIdByCode.get(def.lineCode) ?? null) : null,
        warehouseId, productId: def.code === 'MK-008' ? (sealerProduct?.id ?? null) : null,
        powerKw: def.powerKw, purchaseCost, status: 'idle', note: def.note,
      })
      .onConflictDoUpdate({
        target: machines.code,
        set: { name: def.name, category: def.category, lineId: def.lineCode ? (lineIdByCode.get(def.lineCode) ?? null) : null, powerKw: def.powerKw, purchaseCost, note: def.note },
      })
      .returning();
    byCode.set(def.code, row!);
  }
  summary.add('machines', MACHINE_DEFS.length);
  log('maintenance', `${MACHINE_DEFS.length} makine kartı seed edildi (kapasite raporu)`);
  return byCode;
}

type PlanDef = {
  machineCode: string; name: string; intervalValue: number; intervalUnit: 'day' | 'week' | 'month' | 'runtime_hours';
  checklist: string[]; estimatedMinutes: number;
};

const PLAN_DEFS: PlanDef[] = [
  { machineCode: 'MK-001', name: 'Haftalık bıçak/hazne temizliği', intervalValue: 1, intervalUnit: 'week', checklist: ['Bıçak keskinliği', 'Parçalama haznesi temizliği', 'Hijyen kontrolü'], estimatedMinutes: 30 },
  { machineCode: 'MK-002', name: '500 çalışma saatinde rulman kontrolü', intervalValue: 500, intervalUnit: 'runtime_hours', checklist: ['Rulman sesi/ısısı', 'Yağlama'], estimatedMinutes: 60 },
  { machineCode: 'MK-003', name: 'Aylık conta ve basınç kontrolü', intervalValue: 1, intervalUnit: 'month', checklist: ['Conta aşınması', 'Basınç testi', 'Sızdırmazlık'], estimatedMinutes: 45 },
  { machineCode: 'MK-004', name: 'Aylık sıyırıcı ve tank iç yüzey kontrolü', intervalValue: 1, intervalUnit: 'month', checklist: ['Sıyırıcı aşınması', 'İç yüzey paslanma'], estimatedMinutes: 40 },
  { machineCode: 'MK-005', name: 'Haftalık nozul temizliği', intervalValue: 1, intervalUnit: 'week', checklist: ['Nozul tıkanıklığı', 'Dolum hassasiyeti', 'Contalar'], estimatedMinutes: 25 },
  { machineCode: 'MK-008', name: 'Aylık indüksiyon başlığı kalibrasyonu', intervalValue: 1, intervalUnit: 'month', checklist: ['Kapatma sıcaklığı', 'Folyo yapışma testi'], estimatedMinutes: 30 },
  { machineCode: 'MK-010', name: '3 aylık genel bakım', intervalValue: 3, intervalUnit: 'month', checklist: ['Isıtma elemanı', 'Karıştırıcı motoru', 'Emniyet valfi'], estimatedMinutes: 90 },
  { machineCode: 'MK-011', name: 'Haftalık mikser temizliği', intervalValue: 1, intervalUnit: 'week', checklist: ['İç yüzey temizliği', 'Kapak contası'], estimatedMinutes: 30 },
  { machineCode: 'MK-014', name: 'Aylık dolum kalibrasyonu', intervalValue: 1, intervalUnit: 'month', checklist: ['Gramaj kalibrasyonu', 'Toz kaçağı kontrolü'], estimatedMinutes: 40 },
  { machineCode: 'MK-015', name: 'Aylık bant ve kapatma kontrolü', intervalValue: 1, intervalUnit: 'month', checklist: ['Isıtma bandı sıcaklığı', 'Kapatma sızdırmazlığı'], estimatedMinutes: 35 },
  { machineCode: 'MK-018', name: 'Haftalık stick nozul temizliği', intervalValue: 1, intervalUnit: 'week', checklist: ['Nozul temizliği', 'Gramaj testi'], estimatedMinutes: 20 },
  { machineCode: 'MK-023', name: 'Günlük hassasiyet testi', intervalValue: 1, intervalUnit: 'day', checklist: ['Fe/Non-Fe/SS test parçası geçişi', 'Reddetme mekanizması'], estimatedMinutes: 10 },
];

async function seedPlans(tx: DbOrTx, byCode: Map<string, typeof machines.$inferSelect>, assigneeId: string | null, summary: SeedSummary): Promise<Map<string, Awaited<ReturnType<typeof createPlan>>>> {
  const byPlanMachine = new Map<string, Awaited<ReturnType<typeof createPlan>>>();
  for (const def of PLAN_DEFS) {
    const machine = byCode.get(def.machineCode);
    if (!machine) throw new Error(`seed:maintenance — plan için makine bulunamadı: ${def.machineCode}`);
    const plan = await createPlan(tx, { machineId: machine.id, name: def.name, intervalValue: def.intervalValue, intervalUnit: def.intervalUnit, checklist: def.checklist, estimatedMinutes: def.estimatedMinutes, assigneeId }, SYSTEM_ACTOR);
    byPlanMachine.set(def.machineCode, plan);
  }
  summary.add('maintenance_plans', PLAN_DEFS.length);
  log('maintenance', `${PLAN_DEFS.length} periyodik bakım planı oluşturuldu`);
  return byPlanMachine;
}

// 1x1 şeffaf PNG — seed'de gerçek bir kamera görüntüsü yerine deterministik yer tutucu (arıza fotoğrafı).
const PLACEHOLDER_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const addHours = (d: Date, h: number): Date => new Date(d.getTime() + h * 3_600_000);

async function seedOrders(
  tx: DbOrTx,
  byCode: Map<string, typeof machines.$inferSelect>,
  plans: Map<string, Awaited<ReturnType<typeof createPlan>>>,
  summary: SeedSummary,
): Promise<void> {
  const now = new Date();

  // 2 arıza (fotoğraflı), TAMAMLANMIŞ — bugünün kullanılabilirliğini gerçekten düşürür (§Kabul).
  // `reportBreakdown` duruşu KENDİ çağrıldığı anda (`new Date()`) başlatır — bu yüzden gerçekçi bir
  // onarım süresi üretmek için `startOrder`/`completeOrder`'a dönen `reportedAt`'tan İLERİ (asla geri
  // değil) bir `asOf` verilir; aksi halde duruş süresi ~0 dk çıkar (ilk sürümün hatası).
  const bo1 = await reportBreakdown(tx, {
    machineId: byCode.get('MK-005')!.id, title: 'Dolum başlığı sızdırıyor', description: 'Vardiya başında nozul altında sıvı birikmesi fark edildi.',
    priority: 'high', photos: [{ fileName: 'ariza-mk005-1.png', mimeType: 'image/png', dataUrl: PLACEHOLDER_PHOTO }, { fileName: 'ariza-mk005-2.png', mimeType: 'image/png', dataUrl: PLACEHOLDER_PHOTO }],
  }, SYSTEM_ACTOR);
  await startOrder(tx, bo1.id, SYSTEM_ACTOR, { asOf: addHours(bo1.reportedAt, 0.1) });
  await completeOrder(tx, bo1.id, { rootCause: 'Nozul contası aşınmış', resolution: 'Conta değiştirildi, sızdırmazlık test edildi', laborMinutes: 75, laborCost: '450', partsCost: '180', asOf: addHours(bo1.reportedAt, 1.5) }, SYSTEM_ACTOR);

  const bo2 = await reportBreakdown(tx, {
    machineId: byCode.get('MK-014')!.id, title: 'Gramaj sapması — toz dolumu tutarsız', description: 'Ardışık paketlerde ±3g sapma gözlendi, hat durduruldu.',
    priority: 'critical', photos: [{ fileName: 'ariza-mk014-1.png', mimeType: 'image/png', dataUrl: PLACEHOLDER_PHOTO }],
  }, SYSTEM_ACTOR);
  await startOrder(tx, bo2.id, SYSTEM_ACTOR, { asOf: addHours(bo2.reportedAt, 0.05) });
  await completeOrder(tx, bo2.id, { rootCause: 'Yük hücresi kalibrasyon kayması', resolution: 'Yeniden kalibre edildi', laborMinutes: 40, laborCost: '200', partsCost: '0', asOf: addHours(bo2.reportedAt, 0.75) }, SYSTEM_ACTOR);

  // 3 periyodik, TAMAMLANMIŞ — periyodik bakımın kendisi duruş üretmez (yalnızca arıza `downtimes`
  // açar, bkz. orders.ts); yalnızca başlangıç/bitiş saatleri gerçekçi bir çalışma süresi (dk cinsinden)
  // ile ileri doğru ilerler.
  const periodicDefs: Array<{ machineCode: string; durationMinutes: number }> = [
    { machineCode: 'MK-001', durationMinutes: 30 },
    { machineCode: 'MK-023', durationMinutes: 10 },
    { machineCode: 'MK-018', durationMinutes: 20 },
  ];
  for (const def of periodicDefs) {
    const plan = plans.get(def.machineCode);
    if (!plan) throw new Error(`seed:maintenance — periyodik plan bulunamadı: ${def.machineCode}`);
    const { order } = await generateOrderForPlan(tx, plan, SYSTEM_ACTOR, { scheduledFor: businessDate(now) });
    await startOrder(tx, order.id, SYSTEM_ACTOR, { asOf: addHours(order.reportedAt, 0.02) });
    await completeOrder(tx, order.id, { resolution: 'Kontrol listesi tamamlandı, anormallik yok', asOf: addHours(order.reportedAt, def.durationMinutes / 60) }, SYSTEM_ACTOR);
  }

  // 1 AÇIK arıza — makine hâlâ down, kanban/liste "reported" kolonunda görünür.
  await reportBreakdown(tx, {
    machineId: byCode.get('MK-011')!.id, title: 'Mikser motorunda anormal ses', description: 'Operatör devreye alırken metalik ses duyuldu, güvenlik için durduruldu.', priority: 'high',
  }, SYSTEM_ACTOR);

  summary.add('maintenance_orders', 6);
  log('maintenance', '6 bakım iş emri oluşturuldu (2 arıza fotoğraflı tamamlanmış, 3 periyodik tamamlanmış, 1 açık arıza)');
}

export async function seedMaintenance(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const [existing] = await tx.select({ id: machines.id }).from(machines).limit(1);
  if (existing) {
    log('maintenance', 'makineler zaten var — atlanıyor (idempotent)');
    return;
  }

  log('maintenance', 'makine kartları, bakım planları, iş emirleri, OEE...');
  const byCode = await seedMachines(tx, summary);

  const [bakimUser] = await tx.select({ id: users.id }).from(users).where(eq(users.email, 'bakim@plantero.local')).limit(1);
  const assigneeId = bakimUser?.id ?? null;

  const plans = await seedPlans(tx, byCode, assigneeId, summary);
  await seedOrders(tx, byCode, plans, summary);

  // 30 günlük OEE — üretim seed'inin geçmiş iş emri günleri (-28,-21,-14,-7,-3,0) + bugünün bakım
  // duruşları gerçek `downtimes`/`work_order_outputs` verisinden hesaplanır (bkz. maintenance/oee.ts).
  const today = businessDate(new Date());
  const recomputed = await recomputeOeeForRange(tx, addDays(today, -29), today);
  summary.add('oee_records', recomputed);
  log('maintenance', `${recomputed} günlük OEE kaydı hesaplandı (son 30 gün)`);
}
