/** Tur 23 (shell) — shell-combobox-option-touch-01 kapanış kanıtı: Combobox açık, seçenek + tetikleyici yüksekliği. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const [kind, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route: '/ihracat/sevkiyatlar/yeni', as: 'admin' });
    const trigger = p.getByRole('combobox').first();
    const triggerBox = await trigger.boundingBox();
    await trigger.click();
    await p.waitForTimeout(500);
    const options = await p.evaluate(`Array.from(document.querySelectorAll('[role=option]')).map(o=>({text:o.textContent.replace(/\\s+/g,' ').trim(), h:Math.round(o.getBoundingClientRect().height)}))`);
    out[kind] = { triggerH: triggerBox ? Math.round(triggerBox.height) : null, options };
    await p.screenshot({ path: resolve(process.cwd(), 'artifacts', 'screens', 'ihracat-sevkiyatlar-yeni', `${kind}-combobox-open-r23.png`), animations: 'disabled' });
    await ctx.close();
  }
  await browser.close();
  writeFileSync(resolve(process.cwd(), 'artifacts', 'critic', 'probe-shell-r23-combobox.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
