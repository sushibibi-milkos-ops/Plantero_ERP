import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { sql } from '../client.js';

const CHECKS_DIR = path.dirname(fileURLToPath(import.meta.url));

async function checkFiles(): Promise<string[]> {
  const entries = await readdir(CHECKS_DIR);
  return entries.filter((f) => /^\d{2}_.+\.sql$/.test(f)).sort();
}

// Modül yüklenirken bir kere okunur — describe/it.each senkron kurulum sırasında kullanılabilir.
const FILES = await checkFiles();

// Not: başlık "I1..I21" turdan kalma — I22 (üretim denormalize), I23/I24 (satın alma faturalama/sipariş
// zinciri), I25 (GRNI bakiyesi), I26 (kalite/lot dispozisyonu), I27 (lot durumu/lokasyon usage), I28
// (iş emri malzeme/reçete formülü), I29 (mutabakat kaydı bütünlüğü), I30 (banka hesabı para birimi),
// I31/I32 (kanal hakediş mutabakatı/ödeme bütünlüğü), I33 (gelecek tarihli nakit olayı yasağı, tur 13
// P0), I34/I35 (kredi taksit takvimi iç tutarlılığı + kredi hesap planı bakiyesi, tur 14), I36
// (ihracat sevkiyat zinciri boşluğu), I37 (yevmiye ters kayıt koruması — stok/üretim kaynaklı fiş
// reversed olamaz), I38 (iş emri tüketim/çıktı/fire satırları ↔ bağlı stock_moves birebir tutarlılığı)
// ve I39 (değerli stok hareketi tutarı = bağlı yevmiye fişi tutarı, VUK+UFRS — tur 7) sonraki turlarda
// eklendi; I40 (geri çağırma/SKT sonrası zaman-duyarlı yeni hareket yasağı — veri-critic turu, canlı
// doğrulama: RC-2026-000001 initiate() sonrası I6/I16'nın recalled/expired'ı da kapsayan eski hali
// yanlış-pozitif üretiyordu; kapsam I6/I16'da quarantine/rejected'a daraltıldı, I40 zaman damgası ile
// gerçek regresyonu ayrıca yakalar) ve I41 (tedarikçi kalite skoru formülü + partners.supplier_quality_score
// güncelliği — kalite modülünde daha önce hiç doğrulanmayan bir kör nokta) eklendi; dosya sayısı/aralığı
// buna göre güncellendi. I42 (veri-critic, Aşama-3 tur 2) eklendi: kritik stok motorunun tedarikçi
// bazında birleştirilmiş AI taslak PO'larında, tek bir satırın reorder_rule'u autoOrderMaxAmount=NULL
// (sınırsız) taşıdığında DİĞER satırların sonlu tutar sınırının sessizce iptal olması (kod incelemesiyle
// doğrulandı, bkz. checks/42_reorder_auto_order_cap.sql üst yorumu) — bugün seed'de tetiklenmiyor,
// saf regresyon güvenlik ağı. I43 (irsaliye+lot durumu, tur 3), I44 (ihracat sevkiyatı iptali sonrası
// belge zinciri temizliği, tur 5) eklendi. I45 (veri-critic Tur 6, YENİ): `budget_lines.actual` /
// `cashflow_lines.actual*` (`/finans/butce` "Yenile" düğmesi, `refreshActuals`) muhasebeye yeni bir
// fiş posted olduğunda OTOMATİK güncellenmiyor — canlı egzersizle kanıtlandı (bkz.
// checks/45_budget_cashflow_actual_freshness.sql üst yorumu): fresh seed sonrası doğrudan
// `postJournalEntry` ile 770.02 hesabına 5.000 TL'lik posted bir fiş yazıldı, I1-I44'ün HİÇBİRİ
// bunu yakalamadı ama `budget_lines.actual`/`cashflow_lines.actual_fixed_expenses` eski (0,00 TL)
// değerde donuk kaldı — test verisi temizlenip `db:reset` ile taze seed'e dönüldü. I46 (veri-critic
// Tur 8, YENİ, P0): iptal edilen bir satış siparişinin (`cancelOrder`) zaten FEFO ile rezerve edilmiş
// ('reserved'/'picking'/'picked') ama henüz sevk edilmemiş irsaliyesi hiç kontrol edilmiyor/kapatılmıyor
// — canlı egzersizle kanıtlandı (bkz. checks/46_orphan_reservation.sql üst yorumu): fresh seed'deki
// SO-2026-000003 (irsaliyesi DN-2026-000003, 27 birim rezerve) üzerinde `cancelOrder` doğrudan çağrıldı,
// hatasız tamamlandı, irsaliye 'reserved'de kaldı ve stock_quants.reserved_qty hiç değişmedi — I1-I45'in
// HİÇBİRİ bunu yakalamadı (I2 yalnızca reserved≤qty'yi kontrol ediyor, arkasındaki belgenin hâlâ canlı
// olup olmadığını sormuyor); test verisi `pnpm db:reset` ile temizlendi. I47 (veri-critic Tur 8 düzeltme
// turu, YENİ, P2): I6'nın `lot_qty_exceeds_initial` alt kuralı miktar dengesini `scraps`/`work_order_scraps`
// denormalize ara tablolarından kontrol ediyordu; `recordScrap()` (`packages/core/src/production/finish.ts`)
// `work_order_scraps.lot_id`'yi hiç yazmadığından (fresh seed'deki PL-260816-H1-01/PL-260823-H2-01 mamul
// lotlarının ikisi de bunu canlı olarak kanıtlıyor) bu join'ler production kökenli lotlar için sessizce
// boş dönüyor ve I6 gerçek fiziksel dengeyi hiç test etmeden yeşile düşüyordu. I47 aynı dengeyi TEK
// kanonik kaynaktan (`stock_moves` + `stock_quants`, hiçbir ara tabloya dokunmadan) production kökenli
// lotlar için yeniden kurar — bkz. checks/47_production_lot_qty_balance.sql üst yorumu. I48 (veri-critic
// Tur 9, YENİ, P1, KIRMIZI — I21'in Tur 3'teki muamelesiyle aynı disiplin, bkz. docs/INVARIANTS.md):
// satın alma beyaz liste kapısının KENDİSİ (I42 yalnızca tutar sınırını doğruluyordu) — fresh seed'deki
// `packages/db/src/seed/purchasing.ts::seedDemoDrafts`in ürettiği `PO-2026-000008` (Ege Ambalaj/Etiket)
// gerçek whitelist değerlendirmesinden hiç geçmeden `isAutoApproved:true` + boş `reorderRuleId` ile
// üretiliyor; bu yüzden aşağıdaki "0 ihlal" testi BİLİNÇLİ OLARAK KIRMIZI bırakıldı — kod düzeltilmeden
// (seed gerçek bir reorder_rule id'si vermeden) testi yeşile zorlamak yanlış olurdu. Düzeltme önerisi
// checks/48_reorder_whitelist_gate.sql üst yorumunda.
// I49 (veri-critic Tur 10, YENİ, P1, KIRMIZI — canlı egzersizle kanıtlandı, bkz. checks/49_approval_queue_integrity.sql
// üst yorumu): `approvals` (onay kuyruğu) kararının altındaki belgeye gerçekten yansıdığını doğrulayan ilk kural.
// `notifications/approvals/dispatch.ts::rejectQueueItem`'in 'count_variance' dalı yalnızca `approvals.status='rejected'`
// yazıyor, `stock_counts.status`'e hiç dokunmuyor — reddedilen bir sayım farkı sonsuza dek 'review'de kilitli kalıyor
// (approve dalı `approveCount()` çağırıp count'u ilerletiyor, reject dalının simetriği yok; `cancelCount` diye bir
// fonksiyon da yok). Fresh seed'de 0 ihlal (seed hiç count_variance onayı üretmiyor — eşik altı tek sayım fark).
// I51 (veri-critic, veri bütünlüğü turu — YENİ, P1, KIRMIZI, kök neden, CANLI DOĞRULANDI): bakım
// (maintenance) modülünün `parts_cost`/`labor_cost` alanları (`packages/core/src/maintenance/
// orders.ts`) gerçek, kapanmış (`status='done'`) iş emirlerinde pozitif tutar taşıyor
// (MO-2026-000001: 630,00 TL, MO-2026-000002: 200,00 TL) ama HİÇBİR `postJournalEntry` çağrısı
// yok — `journal_entries.ref_type` kümesinde 'maintenance_order' hiç yok, `730`/`770.10` hesabına
// dokunan tek satır yok — `document_type` enum'u bu bağ için özel olarak `'maintenance_order'`
// içerdiği halde (schema/documents.ts) hiç kullanılmıyor. Bu yüzden aşağıdaki "0 ihlal" testi
// BİLİNÇLİ OLARAK KIRMIZI bırakıldı (I18/I21/I48/I49'un aynı disiplini) — kod düzeltilmeden testi
// yeşile zorlamak yanlış olurdu. Düzeltme önerisi checks/51_maintenance_cost_not_posted.sql üst
// yorumunda. I52 (aynı tur, YENİ, P2, saf regresyon güvenlik ağı — fresh seed'de 0 ihlal): ihracat
// packing list (export_packages) satırlarının lot/miktar zinciri bağlı delivery_lines'la birebir
// örtüşmesini doğrular (bkz. checks/52_export_package_lot_integrity.sql üst yorumu).
const RULE_COUNT = 52;
describe(`bütünlük kontrolleri (I1..${RULE_COUNT}) — sözdizimsel çalışırlık`, () => {
  it(`checks/ altında tam olarak ${RULE_COUNT} kural dosyası var (01..${RULE_COUNT})`, () => {
    expect(FILES).toHaveLength(RULE_COUNT);
    const numbers = FILES.map((f) => Number(f.slice(0, 2))).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: RULE_COUNT }, (_, i) => i + 1));
  });

  it('temel seed (core+uoms+masterdata+accounting+finance) üzerinde tüm kurallar hatasız çalışır ve 0 ihlal döner', async () => {
    for (const file of FILES) {
      const text = await readFile(path.join(CHECKS_DIR, file), 'utf-8');
      let rows: unknown[];
      try {
        rows = (await sql.unsafe(text)) as unknown[];
      } catch (err) {
        throw new Error(`${file} çalıştırılamadı: ${err instanceof Error ? err.message : String(err)}`);
      }
      // Bu turda veritabanında yalnızca temel seed (işlemsel veri yok) olduğundan tüm kurallar
      // 0 satır (ihlal yok) döndürmelidir — boş kümede toplam karşılaştırmaları da 0=0 olarak geçer.
      expect(rows, `${file} beklenmedik ihlal döndürdü: ${JSON.stringify(rows).slice(0, 500)}`).toHaveLength(0);
    }
  });

  it.each(FILES)('%s her satırda rule/entity/id/expected/actual/diff kolonlarını döndürür (şema doğrulaması)', async (file) => {
    const text = await readFile(path.join(CHECKS_DIR, file), 'utf-8');
    // LIMIT 0 sarmalayıcı ile satır olmadan da kolon şemasını doğrular
    const wrapped = `SELECT rule, entity, id, expected, actual, diff FROM (${text.replace(/;\s*$/, '')}) __chk LIMIT 0`;
    const rows = (await sql.unsafe(wrapped)) as unknown[];
    expect(rows).toHaveLength(0);
  });
});
