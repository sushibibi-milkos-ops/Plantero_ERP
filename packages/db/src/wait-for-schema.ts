import 'dotenv/config';
import postgres from 'postgres';
import { is, getTableName } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from './schema/index.js';

/**
 * `drizzle-kit push` (DDL) ile `seed` (DML) arasındaki senkronizasyon katmanı.
 *
 * Kök neden (tur 8 P2): `pnpm db:reset` = `reset.ts && drizzle-kit push --force && seed/index.ts`.
 * Bunlar ayrı alt-process'ler ve aralarındaki tek garanti `&&` zincirinin exit code'u — bu,
 * "push alt-process'i kapandı" demektir, "DDL'in seed'in açacağı YENİ bağlantıdan görünür
 * olduğu" demek DEĞİLDİR. Bazı ortamlarda (connection pooler / farklı arka-uç rotalama) bir
 * bağlantının COMMIT ettiği DDL, milisaniyeler sonra başka bir bağlantıdan sorgulanınca henüz
 * görünmeyebilir; bu da seed'in ilk INSERT'inde ara sıra "relation \"roles\" does not exist"
 * hatasına yol açıyordu (ikinci deneme her zaman temiz geçiyordu çünkü o sırada görünürlük
 * farkı kapanmış oluyordu).
 *
 * Kök neden (round 18 P1 — bu turun düzeltmesi): önceki çözüm yalnızca 4 ERKEN sentinel tabloyu
 * (`roles`/`permissions`/`sequences`/`users` — seed zincirinin ilk core adımının yazdıkları)
 * doğruluyordu. Bu, "bağlantılar arası görünürlük farkı"nın erken tablolarda kapanmış olsa bile
 * GEÇ/FK-ağır tablolarda (ör. `work_orders`) hâlâ açık olabileceği durumu yakalamıyordu —
 * `production` seed adımı `work_orders` sorgusunda "relation does not exist" ile patlıyordu,
 * halbuki 4 sentinel çoktan görünür olmuştu. Sentinel seti ne kadar genişletilirse genişletilsin
 * elle seçilmiş bir liste her zaman eksik kalabilir; bu yüzden artık tek tek tablo seçmek yerine
 * Drizzle şemasında (`schema/index.ts`'in re-export ettiği TÜM dosyalar) tanımlı HER `pgTable`
 * programatik olarak toplanır (`is(value, PgTable)` + `getTableName`) ve push sonrası bunların
 * TAMAMININ (113+ tablo, `work_orders` dahil) taze bir bağlantıdan görünür olduğu doğrulanır.
 * Böylece yeni bir tablo şemaya eklendiğinde bu dosya elle güncellenmeden otomatik kapsanır.
 *
 * Her denemede bilinçli olarak YENİ bir postgres bağlantısı açılır (aynı bağlantıyı yeniden
 * kullanmak, farklı bağlantılar arası görünürlük farkını maskeler ve tam da yakalanmak istenen
 * hata sınıfını gizler).
 */

export function collectExpectedTableNames(): string[] {
  const names = new Set<string>();
  for (const value of Object.values(schema)) {
    if (is(value as object, PgTable)) {
      names.add(getTableName(value as never));
    }
  }
  return [...names].sort();
}

const EXPECTED_TABLES = collectExpectedTableNames();
const POLL_INTERVAL_MS = 100;
const TIMEOUT_MS = 20_000;
// Regresyon koruması: şema modülünün doğru import edildiğinden emin ol — bu sayı çok düşükse
// (ör. import hatası yüzünden Object.values(schema) boş dönerse) sessizce "her şey hazır"
// denilmesin, açıkça patlasın.
export const MIN_EXPECTED_TABLES = 50;

async function checkOnce(url: string): Promise<string[]> {
  const sql = postgres(url, { max: 1 });
  try {
    const rows = await sql<{ table_name: string; ok: boolean }[]>`
      select t.table_name, (to_regclass('public.' || t.table_name) is not null) as ok
      from unnest(${EXPECTED_TABLES}::text[]) as t(table_name)
    `;
    return rows.filter((r) => !r.ok).map((r) => r.table_name);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

async function main() {
  if (EXPECTED_TABLES.length < MIN_EXPECTED_TABLES) {
    throw new Error(
      `[db:wait-for-schema] Drizzle şemasından yalnızca ${EXPECTED_TABLES.length} tablo toplanabildi (beklenen en az ${MIN_EXPECTED_TABLES}) — schema/index.ts import'u bozuk olabilir, kontrol et.`,
    );
  }

  const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
  const startedAt = Date.now();
  let attempt = 0;

  for (;;) {
    attempt += 1;
    const missing = await checkOnce(url);
    if (missing.length === 0) {
      console.log(
        `[db:wait-for-schema] şema hazır (${attempt}. deneme, ${Date.now() - startedAt}ms) — Drizzle şemasındaki ${EXPECTED_TABLES.length} tablonun tamamı görünür.`,
      );
      return;
    }
    if (Date.now() - startedAt > TIMEOUT_MS) {
      throw new Error(
        `[db:wait-for-schema] şema ${TIMEOUT_MS}ms içinde hazır olmadı — eksik tablo(lar) (${missing.length}/${EXPECTED_TABLES.length}): ${missing.join(', ')}. 'drizzle-kit push --force' başarısız olmuş olabilir.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// Yalnızca doğrudan script olarak çalıştırılınca (tsx src/wait-for-schema.ts) bağlanır — modül test
// dosyasından `collectExpectedTableNames`/`MIN_EXPECTED_TABLES` gibi yardımcıları import ederken
// gerçek bir DB bağlantısı açıp process.exit çağırmasın diye korunur.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
