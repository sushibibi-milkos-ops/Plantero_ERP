/**
 * Tur 14 — kod düzeyi tarama (düzeltilmiş): yalnızca SÜRESİ > 0 olan geçişler sayılır.
 * CSS varsayılanı transition-property:all olduğundan süre filtresi olmadan tarama yanlış alarm üretir.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const ROUTES = [
  '/bakim/makineler',
  '/bakim/makineler/8d445599-2fa3-4433-96a5-972be1a6f91e',
  '/bakim/planlar',
  '/bakim/is-emirleri',
  '/bakim/is-emirleri/d96f2887-9da4-47b5-9e5a-efebe3a3158d',
  '/bakim/is-emirleri/yeni',
  '/bakim/oee',
];

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  const out: Record<string, unknown> = {};

  for (const route of ROUTES) {
    await openRoute(page, { base, route, as: 'admin' });
    out[route] = await page.evaluate(() => {
      const bad: Array<Record<string, string>> = [];
      Array.from(document.querySelectorAll('*')).forEach((el) => {
        const cs = getComputedStyle(el);
        const cls = (el.getAttribute('class') ?? '').slice(0, 90) || el.tagName;
        const props = cs.transitionProperty.split(',').map((p) => p.trim());
        const tdur = cs.transitionDuration.split(',').map((x: string) => (x.trim().endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000));
        const ttf = cs.transitionTimingFunction.split(',').map((s) => s.trim());
        props.forEach((p, i) => {
          const d = tdur[i % tdur.length] ?? 0;
          if (d <= 0) return;
          if (p === 'all') bad.push({ kind: 'transition-all', cls, d: String(d) });
          if (d >= 300) bad.push({ kind: 'transition>=300ms', cls, p, d: String(d) });
          const t = ttf[i % ttf.length] ?? '';
          if (/^ease-in$|cubic-bezier\(0\.4,\s*0,\s*1,\s*1\)/.test(t)) bad.push({ kind: 'ease-in', cls, p, t });
        });
        if (cs.animationName !== 'none' && cs.animationName !== '') {
          const ad = cs.animationDuration.split(',').map((x: string) => (x.trim().endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000));
          const atf = cs.animationTimingFunction.split(',').map((s) => s.trim());
          if (ad.some((d) => d >= 300) && cs.animationIterationCount === '1')
            bad.push({ kind: 'animation>=300ms(once)', cls, name: cs.animationName, d: cs.animationDuration });
          if (atf.some((t) => /^ease-in$/.test(t))) bad.push({ kind: 'anim-ease-in', cls, name: cs.animationName });
        }
        if (/scale\(0\)|scale\(0,\s*0\)/.test(cs.transform)) bad.push({ kind: 'scale(0)', cls });
      });
      return bad;
    });
  }

  // Kaynak taraması yerine: hover korumasının globals.css'te olduğunu doğrula
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
