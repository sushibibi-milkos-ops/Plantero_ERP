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
// I31/I32 (kanal hakediş mutabakatı/ödeme bütünlüğü) ve I33 (gelecek tarihli nakit olayı yasağı, tur 13
// P0) sonraki turlarda eklendi; dosya sayısı/aralığı buna göre güncellendi.
const RULE_COUNT = 33;
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
