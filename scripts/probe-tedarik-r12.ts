import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const out: any = {};
  for (const [k, route] of [['kritik-stok','/satin-alma/kritik-stok'],['yeni','/satin-alma/siparisler/yeni']] as Array<[string,string]>) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await c.newPage();
    await openRoute(p, { base, route, as: 'admin' });
    await p.waitForTimeout(800);
    const stops: any[] = [];
    for (let i = 0; i < 30; i++) {
      await p.keyboard.press('Tab'); await p.waitForTimeout(200);
      const info = await p.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || a === document.body || !a.closest('main')) return null;
        const cs = getComputedStyle(a);
        return { tag: a.tagName.toLowerCase(), txt: (a.textContent||'').trim().slice(0,26), aria: a.getAttribute('aria-label')||'', outline: cs.outline, shadow: cs.boxShadow };
      });
      if (info) stops.push(info);
    }
    out[k] = stops;
    await c.close();
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r12.json', JSON.stringify(out, null, 1));
}
main().catch(e=>{console.error(e);process.exit(1);});
