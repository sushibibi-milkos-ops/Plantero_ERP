import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../client.js';
import { rndProjects, rndBoardColumns, rndCards, products, uoms, users } from '../schema/index.js';
import { SYSTEM_ACTOR } from '@plantero/core';
import { createProject } from '@plantero/core/rnd/projects';
import { createCard, moveCard, updateChecklist, addComment, addAttachment, linkTrialVersion } from '@plantero/core/rnd/board';
import { createTrialRecipe, createNewVersion, updateVersionDraft, submitForApproval, approveRecipeRelease, releaseToBom, type TrialLineInput } from '@plantero/core/rnd/trials';
import { log, type SeedSummary } from './_helpers.js';

/**
 * Ar-Ge modülü seed'i — docs/modules/arge.md §Seed.
 * 3 proje: Fıstık Bazı (yeni SKU adayı, `productId=null`), Şekersiz Protein (mevcut ürün, onay
 * sürecinde), Oat Barista v2 (mevcut ürün, ONAYLANIP üretim BOM'una devrolmuş — kabul kriteri).
 * Tamamı `@plantero/core/rnd/*` servisleri üzerinden üretilir (elle insert yok — sözleşme #10);
 * her core fonksiyonu kendi audit satırını zaten yazar.
 */

async function productBySku(tx: DbOrTx, sku: string) {
  const [row] = await tx.select().from(products).where(eq(products.sku, sku)).limit(1);
  if (!row) throw new Error(`seed:rnd — ürün bulunamadı (SKU): ${sku}`);
  return row;
}

async function uomByCode(tx: DbOrTx, code: string) {
  const [row] = await tx.select().from(uoms).where(eq(uoms.code, code)).limit(1);
  if (!row) throw new Error(`seed:rnd — birim bulunamadı: ${code}`);
  return row;
}

async function userByEmail(tx: DbOrTx, email: string) {
  const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return row?.id ?? null;
}

/** Board'a örnek kartlar dağıtır: kolon adı → kart başlıkları listesi (proje kolonlarıyla eşleşmeli). */
async function seedCards(
  tx: DbOrTx,
  projectId: string,
  columnsByName: Map<string, string>,
  defs: Array<{ column: string; title: string; description?: string; assigneeId?: string | null; dueDate?: string | null; labels?: string[]; checklist?: Array<{ text: string; done: boolean }>; comment?: string; trialVersionId?: string }>,
): Promise<void> {
  for (const def of defs) {
    const columnId = columnsByName.get(def.column);
    if (!columnId) throw new Error(`seed:rnd — kolon bulunamadı: ${def.column}`);
    const card = await createCard(tx, { projectId, columnId, title: def.title, description: def.description ?? null, assigneeId: def.assigneeId ?? null, dueDate: def.dueDate ?? null, labels: def.labels ?? [] }, SYSTEM_ACTOR);
    if (def.checklist) await updateChecklist(tx, card.id, def.checklist, SYSTEM_ACTOR);
    if (def.comment) await addComment(tx, { cardId: card.id, body: def.comment }, SYSTEM_ACTOR);
    if (def.trialVersionId) await linkTrialVersion(tx, card.id, def.trialVersionId, SYSTEM_ACTOR);
  }
}

const PLACEHOLDER_PDF_NOTE =
  'data:text/plain;base64,RHV5dXNhbCB0ZXN0IHJhcG9ydSAtIHBsYWNlaG9sZGVyLg=='; // "Duyusal test raporu - placeholder." (metin dosyası, örnek ek)

export async function seedRnd(tx: DbOrTx, summary: SeedSummary): Promise<void> {
  const [existing] = await tx.select({ id: rndProjects.id }).from(rndProjects).limit(1);
  if (existing) {
    log('rnd', 'Ar-Ge projeleri zaten var — atlanıyor (idempotent)');
    return;
  }

  log('rnd', '3 Ar-Ge projesi, board kartları, deneme reçeteleri, onay + üretim BOM devri...');
  const kg = await uomByCode(tx, 'KG');
  const arge = await userByEmail(tx, 'arge@plantero.local');
  const uretim = await userByEmail(tx, 'uretim@plantero.local');
  if (!arge) throw new Error('seed:rnd — arge@plantero.local kullanıcısı bulunamadı (core seed önce çalışmalı)');
  // Onay/red kararları `SYSTEM_ACTOR` (userId=null) İLE ATILAMAZ — docs/INVARIANTS.md I49(a): kararlı
  // (approved/rejected) bir `approvals` satırının `decided_by` alanı dolu olmalı (kararın kim
  // tarafından verildiğinin izi kaybolmaz). Gerçek akışta bu, oturum açmış onaylayıcının kullanıcı
  // id'sidir — seed'de de gerçek bir kullanıcıya (Ar-Ge Sorumlusu) atfedilir.
  const argeActor = { userId: arge, userEmail: 'arge@plantero.local' };

  /* ================================================================== */
  /* Proje 1 — Fıstık Bazı (yeni SKU adayı, henüz ürün yok)              */
  /* ================================================================== */

  const p1 = await createProject(tx, {
    name: 'Fıstık Bazı', productId: null, targetSku: '110050001', ownerId: arge,
    goal: 'HAT1 bitkisel süt bazları ailesine yeni bir SKU: fıstık bazlı süt alternatifi. Badem/fındık/kaju/yulaf bazlarıyla aynı üretim hattında, benzer maliyet profilinde.',
    targetUnitCost: '28.0000', targetLaunchDate: '2026-12-01',
  }, SYSTEM_ACTOR);

  const p1Cols = new Map((await tx.select().from(rndBoardColumns).where(eq(rndBoardColumns.projectId, p1.id))).map((c) => [c.name, c.id] as const));

  await seedCards(tx, p1.id, p1Cols, [
    { column: 'Fikir', title: 'Pazar araştırması: bitkisel süt kategorisinde fıstık talebi', description: 'Rakip analizinde fıstık bazlı ürün eksik — fırsat olarak değerlendirildi.', labels: ['pazar'], checklist: [{ text: 'Rakip ürün taraması', done: true }, { text: 'Fiyat aralığı analizi', done: true }, { text: 'Alerjen uyarısı gereksinimleri', done: false }] },
    { column: 'Fikir', title: 'Alerjen etiketleme gereksinimlerini netleştir', description: 'Fıstık major alerjen — üretim hattı çapraz bulaşma riski değerlendirilmeli.', labels: ['gıda-güvenliği'], assigneeId: arge },
    { column: 'Formülasyon', title: 'İlk deneme reçetesi taslağı', description: 'Badem bazı formülasyonundan uyarlanan ilk taslak — bkz. bağlı deneme reçetesi.', assigneeId: arge, dueDate: '2026-10-15', checklist: [{ text: 'Su/fıstık oranı belirle', done: true }, { text: 'Tatlandırıcı oranı', done: false }] },
    { column: 'Pilot Üretim', title: 'HAT1 pilot parti planlaması', description: 'İlk pilot parti için HAT1 kapasite ayrılacak.', assigneeId: uretim },
    { column: 'Duyusal Test', title: 'İç duyusal panel', comment: 'Panel tarihi henüz netleşmedi — formülasyon onaylandıktan sonra planlanacak.' },
  ]);

  const p1Recipe = await createTrialRecipe(tx, {
    projectId: p1.id, name: 'Fıstık Bazı', batchQty: '1', batchUomId: kg.id, expectedYieldPct: '96', overheadPerBatch: '0.35', overheadPerUnit: '0.05',
    changeNote: 'İlk taslak — badem bazı oranlarından uyarlandı, fıstık maliyeti manuel girildi (henüz alış geçmişi yok).',
    lines: [
      { productId: (await productBySku(tx, '301030000')).id, qty: '0.15', uomId: kg.id, costSource: 'manual', manualUnitCost: '38.0000', scrapPct: '2', note: 'Fıstık için ayrı hammadde tanımlanana kadar geçici — badem hammaddesi üzerinden manuel maliyetlendirildi' },
      { productId: (await productBySku(tx, '302030000')).id, qty: '0.02', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: (await productBySku(tx, '307020000')).id, qty: '0.002', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: (await productBySku(tx, '401010000')).id, qty: '1', uomId: (await uomByCode(tx, 'ADET')).id, costSource: 'average', scrapPct: '0' },
    ] satisfies TrialLineInput[],
  }, SYSTEM_ACTOR);
  await linkTrialVersion(tx, (await tx.select().from(rndCards).where(eq(rndCards.title, 'İlk deneme reçetesi taslağı')))[0]!.id, p1Recipe.rollup.version.id, SYSTEM_ACTOR);

  /* ================================================================== */
  /* Proje 2 — Şekersiz Protein (mevcut ürün, onay sürecinde)            */
  /* ================================================================== */

  const proteinProduct = await productBySku(tx, '130010001'); // Plain Protein Mixi
  const p2 = await createProject(tx, {
    name: 'Şekersiz Protein', productId: proteinProduct.id, ownerId: arge,
    goal: 'Mevcut Plain Protein Mixi formülasyonundan sukralozu çıkarıp inülin oranını artırarak şekersiz/düşük glisemik varyant geliştirmek.',
    targetUnitCost: '210.0000', targetLaunchDate: '2026-11-01',
  }, SYSTEM_ACTOR);
  const p2Cols = new Map((await tx.select().from(rndBoardColumns).where(eq(rndBoardColumns.projectId, p2.id))).map((c) => [c.name, c.id] as const));

  const p2Recipe = await createTrialRecipe(tx, {
    projectId: p2.id, name: 'Şekersiz Protein', batchQty: '1', batchUomId: kg.id, expectedYieldPct: '97', overheadPerBatch: '50', overheadPerUnit: '0.5',
    changeNote: 'Sukraloz (302010000) çıkarıldı, inülin oranı 0.02→0.04 kg artırıldı (tatlandırma dengesi için).',
    lines: [
      { productId: (await productBySku(tx, '301010000')).id, qty: '0.30', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: (await productBySku(tx, '301020000')).id, qty: '0.10', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: (await productBySku(tx, '303010000')).id, qty: '0.005', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: (await productBySku(tx, '303020000')).id, qty: '0.003', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: (await productBySku(tx, '306010000')).id, qty: '0.04', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: (await productBySku(tx, '305010000')).id, qty: '0.002', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: (await productBySku(tx, '307010000')).id, qty: '0.02', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: (await productBySku(tx, '402010000')).id, qty: '1', uomId: (await uomByCode(tx, 'ADET')).id, costSource: 'average', scrapPct: '0' },
      { productId: (await productBySku(tx, '401030000')).id, qty: '1', uomId: (await uomByCode(tx, 'ADET')).id, costSource: 'average', scrapPct: '0' },
    ] satisfies TrialLineInput[],
  }, SYSTEM_ACTOR);
  await submitForApproval(tx, p2Recipe.rollup.version.id, argeActor); // onay bekliyor — henüz devredilmedi (kabul: uçtan uca akışın "ortası" da seed'de görünür)

  await seedCards(tx, p2.id, p2Cols, [
    { column: 'Formülasyon', title: 'Sukraloz yerine inülin dengesi', description: 'v1 formülasyonu tamamlandı, maliyet simülasyonu ile hedefin altında.', assigneeId: arge, checklist: [{ text: 'Tatlandırma dengesi', done: true }, { text: 'Çözünürlük testi', done: true }] },
    { column: 'Duyusal Test', title: 'Duyusal panel sonuçları', description: '8 kişilik iç panel — tat/çözünürlük olumlu.', comment: 'Panel notları: tatlılık algısı orijinale çok yakın, hafif inülin sonu aroması var ama kabul edilebilir düzeyde.', trialVersionId: p2Recipe.rollup.version.id },
    { column: 'Raf Ömrü', title: 'Hızlandırılmış raf ömrü testi başlat' },
    { column: 'Onay', title: 'Reçete onayı — üretim BOM devri', description: 'Onaya gönderildi, üretim BOM\'una devir onay sonrası yapılacak.', assigneeId: arge, trialVersionId: p2Recipe.rollup.version.id },
  ]);

  /* ================================================================== */
  /* Proje 3 — Oat Barista v2 (mevcut ürün, ONAYLANDI + BOM'a DEVROLDU)  */
  /* ================================================================== */

  const baristaProduct = await productBySku(tx, '120040001'); // BARISTA BASE - YULAF BAZI
  const p3 = await createProject(tx, {
    name: 'Oat Barista v2', productId: baristaProduct.id, ownerId: arge,
    goal: 'Mevcut yulaf bazlı barista ürününde hurma şurubu oranını azaltıp köpük stabilitesini artırmak.',
    targetUnitCost: '100.0000', targetLaunchDate: '2026-10-01',
  }, SYSTEM_ACTOR);
  const p3Cols = new Map((await tx.select().from(rndBoardColumns).where(eq(rndBoardColumns.projectId, p3.id))).map((c) => [c.name, c.id] as const));

  const yulaf = await productBySku(tx, '301060000');
  const hurma = await productBySku(tx, '302030000');
  const tuz = await productBySku(tx, '307020000');
  const kavanoz = await productBySku(tx, '401010000');
  const kapak = await productBySku(tx, '401020000');
  const etiket = await productBySku(tx, '401030000');
  const adet = await uomByCode(tx, 'ADET');

  const p3v1 = await createTrialRecipe(tx, {
    projectId: p3.id, name: 'Oat Barista Reçetesi', batchQty: '1', batchUomId: kg.id, expectedYieldPct: '97', overheadPerBatch: '50', overheadPerUnit: '0.5',
    changeNote: 'v1 (aktif BOM v1) ile aynı — karşılaştırma taban çizgisi.',
    lines: [
      { productId: yulaf.id, qty: '0.20', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: hurma.id, qty: '0.02', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: tuz.id, qty: '0.002', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: kavanoz.id, qty: '1', uomId: adet.id, costSource: 'average', scrapPct: '0' },
      { productId: kapak.id, qty: '1', uomId: adet.id, costSource: 'average', scrapPct: '0' },
      { productId: etiket.id, qty: '1', uomId: adet.id, costSource: 'average', scrapPct: '0' },
    ] satisfies TrialLineInput[],
  }, SYSTEM_ACTOR);

  const p3v2 = await createNewVersion(tx, { recipeId: p3v1.recipe.id, copyFromVersionId: p3v1.rollup.version.id, changeNote: 'Hurma şurubu 0.02→0.015 kg azaltıldı, köpük stabilizatörü olarak tuz oranı 0.002→0.0015 kg düşürüldü; genel gider payı sabit.' }, SYSTEM_ACTOR);
  await updateVersionDraft(tx, p3v2.version.id, {
    lines: [
      { productId: yulaf.id, qty: '0.20', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: hurma.id, qty: '0.015', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: tuz.id, qty: '0.0015', uomId: kg.id, costSource: 'average', scrapPct: '0' },
      { productId: kavanoz.id, qty: '1', uomId: adet.id, costSource: 'average', scrapPct: '0' },
      { productId: kapak.id, qty: '1', uomId: adet.id, costSource: 'average', scrapPct: '0' },
      { productId: etiket.id, qty: '1', uomId: adet.id, costSource: 'average', scrapPct: '0' },
    ],
  }, SYSTEM_ACTOR);

  const { approvalId } = await submitForApproval(tx, p3v2.version.id, argeActor);
  await approveRecipeRelease(tx, approvalId, argeActor); // I49(a): decided_by dolu olmalı — gerçek onaylayıcı (SYSTEM_ACTOR değil)
  const released = await releaseToBom(tx, p3v2.version.id, { activate: true }, argeActor); // KABUL: devir sonrası iş emri açılabilir (aktif BOM)
  log('rnd', `Oat Barista v2 üretim BOM'una devredildi: ${released.bomCode} (aktif)`);

  await seedCards(tx, p3.id, p3Cols, [
    { column: 'Formülasyon', title: 'v1 taban formülasyon (mevcut BOM)', trialVersionId: p3v1.rollup.version.id },
    { column: 'Formülasyon', title: 'v2: hurma şurubu azaltma denemesi', description: 'Köpük stabilitesi hedefi — duyusal panelde v1 ile karşılaştırıldı.', assigneeId: arge, trialVersionId: p3v2.version.id, checklist: [{ text: 'Köpük stabilite testi', done: true }, { text: 'Tatlılık karşılaştırması', done: true }, { text: 'Maliyet karşılaştırması', done: true }] },
    { column: 'Pilot Üretim', title: 'HAT1 pilot parti — v2', description: 'Pilot parti tamamlandı, sonuçlar olumlu.', assigneeId: uretim },
    { column: 'Duyusal Test', title: 'Barista makinesi köpük testi', comment: 'Üç farklı barista makinesinde test edildi — v2 köpük stabilitesi v1\'e göre belirgin şekilde daha iyi.' },
    { column: 'Raf Ömrü', title: '3 aylık raf ömrü izleme', description: 'Aylık numune alımı devam ediyor.' },
    { column: 'Onay', title: 'Reçete onaylandı ve üretim BOM\'una devredildi', description: `Üretim BOM'u: ${released.bomCode} (aktif). İş emri açılabilir.`, trialVersionId: p3v2.version.id, comment: 'Onay tamamlandı, BOM aktif — üretim planlamasına devredildi.' },
  ]);

  // Onay kolonundaki kartı fiilen "Onay" kolonuna taşı (createCard zaten oraya ekledi; moveCard'ın
  // kalıcılığını da seed içinde bir kez egzersiz eder — dnd-kit kanban'ın kalıcı taşıma yolu).
  const onayCol = p3Cols.get('Onay');
  const [approvalCard] = await tx.select().from(rndCards).where(eq(rndCards.title, "Reçete onaylandı ve üretim BOM'una devredildi"));
  if (onayCol && approvalCard) await moveCard(tx, { cardId: approvalCard.id, toColumnId: onayCol, toIndex: 0 }, SYSTEM_ACTOR);

  // Bir ek: duyusal test raporu (metin dosyası, örnek) — proje 3'ün duyusal test kartına.
  const [sensoryCard] = await tx.select().from(rndCards).where(eq(rndCards.title, 'Barista makinesi köpük testi'));
  if (sensoryCard) await addAttachment(tx, { cardId: sensoryCard.id, fileName: 'duyusal-test-raporu.txt', mimeType: 'text/plain', dataUrl: PLACEHOLDER_PDF_NOTE }, SYSTEM_ACTOR);

  summary.add('rnd_projects', 3);
  summary.add('rnd_board_columns', 18);
  summary.add('trial_recipe_versions', 5); // p1 v1, p2 v1, p3 v1+v2, (createNewVersion de v2 sayılır)
  log('rnd', '3 Ar-Ge projesi seed edildi: Fıstık Bazı (yeni SKU adayı), Şekersiz Protein (onayda), Oat Barista v2 (devredildi, BOM aktif)');
}
