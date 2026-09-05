/** Tur 5 — /bildirimler main içi font kademelerinin hangi elemanlardan geldiği. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();

const JS = `(() => {
  const main = document.querySelector('main');
  const rows = [];
  for (const el of Array.from(main.querySelectorAll('*'))) {
    let hasText = false;
    for (const n of Array.from(el.childNodes)) if (n.nodeType === 3 && n.textContent.trim()) { hasText = true; break; }
    if (!hasText) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rc = el.getBoundingClientRect();
    if (rc.width <= 0 || rc.height <= 0) continue;
    rows.push({ size: cs.fontSize, weight: cs.fontWeight, tag: el.tagName.toLowerCase(), cls: (el.className||'').toString().slice(0,60), text: (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40) });
  }
  return rows;
})()`;

async function run() {
  const out: Record<string, unknown> = {};
  const browser = await launchBrowser();
  try {
    for (const [key, route, as, w, h] of [['bildirimler@1440', '/bildirimler', 'depo', 1440, 900], ['onaylar@1440', '/onaylar', 'admin', 1440, 900]] as const) {
      const ctx = await browser.newContext({ viewport: { width: w as number, height: h as number }, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: route as string, as: as as string, base, dark: false });
      out[key as string] = await page.evaluate(JS);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(process.cwd(), 'artifacts/critic/probe-bildirimler-r5d.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
run().catch((e) => { console.error(e); process.exit(1); });
