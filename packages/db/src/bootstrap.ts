import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { sql } from './client.js';

/**
 * Dağıtımda açılış hazırlığı (scripts/deploy/start-web.sh çağırır).
 *
 * Veritabanı BOŞSA (users tablosu yok ya da satırı yok): şema uygulanır (`drizzle-kit push`), tüm
 * tabloların görünürlüğü beklenir (`wait-for-schema`) ve tam seed yüklenir. DOLUYSA hiçbir şey
 * yapılmaz — yeniden başlatmalar veriyi korur ve `drizzle-kit push` dolu tabloda etkileşimli
 * onay isteyip TTY'siz ortamda sessizce yarım kalabildiğinden (ör. stock_quants_uq önerisi)
 * burada asla dolu veritabanına karşı çalıştırılmaz. Şema değişikliği gerektiğinde
 * `pnpm db:push` bilinçli olarak, elle koşulur.
 */
async function isEmpty(): Promise<boolean> {
  const [t] = await sql<{ n: number }[]>`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'users'`;
  if (!t || t.n === 0) return true;
  const [u] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
  return !u || u.n === 0;
}

function run(script: string) {
  execFileSync('pnpm', ['run', script], { stdio: 'inherit', cwd: new URL('..', import.meta.url) });
}

async function main() {
  const empty = await isEmpty();
  await sql.end({ timeout: 5 });
  if (!empty) {
    console.log('[bootstrap] veritabanı dolu — şema/seed atlandı');
    return;
  }
  console.log('[bootstrap] veritabanı boş — şema uygulanıyor');
  run('push');
  run('wait-for-schema');
  console.log('[bootstrap] tam seed başlıyor');
  run('seed');
  console.log('[bootstrap] hazır');
}

main().catch((err) => {
  console.error('[bootstrap] HATA:', err);
  process.exitCode = 1;
});
