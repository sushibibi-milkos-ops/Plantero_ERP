import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  const out: Record<string, unknown> = {};
  for (const [key, route] of [['tumHatlar', '/bakim/oee'], ['hat1', '/bakim/oee?hat=HAT1']] as const) {
    await openRoute(page, { base, route, as: 'admin' });
    out[key] = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      return tables.map((t) => {
        const heads = Array.from(t.querySelectorAll('thead th')).map((h) => (h as HTMLElement).innerText.trim());
        const rows = Array.from(t.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim()));
        // sütun bazında ondalık basamak sayısı kümesi
        const decimalsPerCol = heads.map((_, i) => {
          const set = new Set<number>();
          rows.forEach((r) => { const v = r[i] ?? ''; if (/^%?[\d.,]+$/.test(v.replace('%', ''))) { const m = /,(\d+)/.exec(v); if (/%/.test(v)) set.add(m ? m[1]!.length : 0); } });
          return Array.from(set).sort();
        });
        return { heads, rows, decimalsPerCol };
      });
    });
    out[key + 'Kpi'] = await page.evaluate(() => Array.from(document.querySelectorAll('[class*="tabular-nums"], .num')).map((e) => (e as HTMLElement).innerText.trim()).filter((t) => t.includes('%')).slice(0, 12));
  }
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
