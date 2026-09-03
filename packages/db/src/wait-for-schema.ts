import 'dotenv/config';
import postgres from 'postgres';

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
 * Çözüm: seed başlamadan önce, push'un yarattığı temel tabloların TAZE bir bağlantı üzerinden
 * gerçekten görünür olduğunu polling ile doğrula. `roles`, seed zincirinin ilk yazdığı tablo
 * (bkz. seed/core.ts) — bu yüzden en kritik sentinel; `permissions`/`sequences`/`users` da aynı
 * ilk adımda hemen ardından yazılır, onları da birlikte doğrulamak ek güvenlik sağlar.
 *
 * Her denemede bilinçli olarak YENİ bir postgres bağlantısı açılır (aynı bağlantıyı yeniden
 * kullanmak, farklı bağlantılar arası görünürlük farkını maskeler ve tam da yakalanmak istenen
 * hata sınıfını gizler).
 */

const SENTINEL_TABLES = ['roles', 'permissions', 'sequences', 'users'] as const;
const POLL_INTERVAL_MS = 100;
const TIMEOUT_MS = 20_000;

async function checkOnce(url: string): Promise<string[]> {
  const sql = postgres(url, { max: 1 });
  try {
    const rows = await sql<{ table_name: string; ok: boolean }[]>`
      select t.table_name, (to_regclass('public.' || t.table_name) is not null) as ok
      from unnest(${SENTINEL_TABLES}::text[]) as t(table_name)
    `;
    return rows.filter((r) => !r.ok).map((r) => r.table_name);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

async function main() {
  const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
  const startedAt = Date.now();
  let attempt = 0;

  for (;;) {
    attempt += 1;
    const missing = await checkOnce(url);
    if (missing.length === 0) {
      console.log(
        `[db:wait-for-schema] şema hazır (${attempt}. deneme, ${Date.now() - startedAt}ms) — sentinel tablolar görünür: ${SENTINEL_TABLES.join(', ')}`,
      );
      return;
    }
    if (Date.now() - startedAt > TIMEOUT_MS) {
      throw new Error(
        `[db:wait-for-schema] şema ${TIMEOUT_MS}ms içinde hazır olmadı — eksik tablo(lar): ${missing.join(', ')}. 'drizzle-kit push --force' başarısız olmuş olabilir.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
