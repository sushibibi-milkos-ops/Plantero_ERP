/** Tur 15b: belge zinciri kart sırası (etiket + belge no), 3 sevkiyat × 2 yükleme. */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const id = (no: string) => execSync(`psql "${DB}" -t -A -c "select id from export_shipments where doc_no='${no}';"`, { encoding: 'utf8' }).trim();

async function main() {
  const browser = await launchBrowser();
  const res: Record<string, string[][]> = {};
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const p = await ctx.newPage();
  for (const no of ['EXP-2026-000001', 'EXP-2026-000002', 'EXP-2026-000003']) {
    const sid = id(no);
    res[no] = [];
    for (let i = 0; i < 2; i++) {
      await openRoute(p, { base: BASE, route: `/ihracat/sevkiyatlar/${sid}`, as: 'admin' });
      const order = await p.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('a[data-pressable]')).filter((a) => /^(SİPARİŞ|İRSALİYE|FATURA|İHRACAT|TEKLİF|MAL KABUL)/i.test((a.textContent ?? '').trim()));
        return cards.map((a) => {
          const t = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
          const label = (t.match(/^[A-ZÇĞİÖŞÜ ]+/) ?? [''])[0].trim();
          const docNo = (t.match(/(SO|DN|INV|EXP|QT|GR)-\d{4}-\d{6}/) ?? ['?'])[0];
          const x = Math.round(a.getBoundingClientRect().left);
          return `${label}:${docNo}@${x}`;
        });
      });
      res[no].push(order);
    }
  }
  await ctx.close();
  writeFileSync('artifacts/critic/probe-ihracat-r15b.json', JSON.stringify(res, null, 2));
  console.error(JSON.stringify(res, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
