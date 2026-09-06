/** Tur 3 — h1/başlık hizası, KPI delta satırı, sıfır rengi ve QtyCell biçim tutarlılığı ölçümü. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collect = () => {
  const out: Record<string, unknown> = {};
  const main = document.querySelector<HTMLElement>('main') ?? document.body;
  const h1 = main.querySelector<HTMLElement>('h1');
  if (h1) {
    const r = h1.getBoundingClientRect();
    out.h1 = { text: (h1.textContent || '').slice(0, 30), left: Math.round(r.left), top: Math.round(r.top + window.scrollY), size: getComputedStyle(h1).fontSize };
  }
  // ana içerik kabının sol kenarı
  const inner = main.firstElementChild as HTMLElement | null;
  out.mainLeft = main ? Math.round(main.getBoundingClientRect().left) : null;
  out.innerLeft = inner ? Math.round(inner.getBoundingClientRect().left) : null;

  // "0" ya da "0 sa" gibi sıfır değerlerin rengi (kriter 6)
  const zeros: unknown[] = [];
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('td, span, div'))) {
    let own = '';
    for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) own += n.textContent ?? '';
    own = own.trim();
    if (!/^0([.,]0+)?$/.test(own)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const cs = getComputedStyle(el);
    zeros.push({ t: own, color: cs.color, tabular: cs.fontVariantNumeric, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 50) });
  }
  out.zeros = zeros.slice(0, 12);

  // KPI delta satırları
  const deltas: unknown[] = [];
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (el.children.length <= 2 && /önceki dönem|önceki/.test(t) && t.length < 40) {
      deltas.push({ t, cls: (el.className || '').toString().slice(0, 60) });
    }
  }
  out.deltas = deltas.slice(0, 6);
  return out;
};

async function main() {
  const argv = process.argv.slice(2);
  const routes = argv.filter((a) => a.startsWith('/'));
  const vpArg = argv.includes('--viewport') ? argv[argv.indexOf('--viewport') + 1]! : '1440x900';
  const m = /^(\d+)x(\d+)$/.exec(vpArg)!;
  const viewport = { width: +m[1]!, height: +m[2]! };
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const res: Record<string, unknown> = {};
  for (const route of routes) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { route, as: 'admin', base });
    await page.evaluate(() => { (globalThis as unknown as { __name?: unknown }).__name = (f: unknown) => f; });
    res[route] = await page.evaluate(collect);
    await ctx.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(res, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
