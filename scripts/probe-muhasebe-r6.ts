/** Tur 6 muhasebe ölçüm probu — mobil kart tipografi/kırpma odaklı. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const ROUTES = process.argv.slice(2).filter((a) => a.startsWith('/'));
const W = Number(process.env.PW ?? 390);
const H = Number(process.env.PH ?? 844);

function collect() {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const vis = (el: Element) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // mobil kartlar
  const cards = Array.from(document.querySelectorAll('main ul > li')).filter(vis) as HTMLElement[];
  const cardInfo = cards.slice(0, 30).map((li) => {
    const row1 = li.firstElementChild as HTMLElement | null;
    const titleEl = row1?.firstElementChild as HTMLElement | null;
    const badgeEls = row1 ? (Array.from(row1.children).slice(1) as HTMLElement[]) : [];
    return {
      h: r1(li.getBoundingClientRect().height),
      title: {
        text: (titleEl?.textContent ?? '').trim().slice(0, 30),
        fs: titleEl ? getComputedStyle(titleEl).fontSize : null,
        sw: titleEl?.scrollWidth ?? 0,
        cw: titleEl?.clientWidth ?? 0,
      },
      badges: badgeEls.map((b) => ({
        text: (b.textContent ?? '').trim().slice(0, 24),
        fs: getComputedStyle(b.firstElementChild ?? b).fontSize,
        w: r1(b.getBoundingClientRect().width),
      })),
    };
  });
  // kırpılan metinler
  const clipped: Array<{ text: string; sw: number; cw: number; fs: string }> = [];
  for (const el of Array.from(document.querySelectorAll('main span, main div, main td, main a')) as HTMLElement[]) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow !== 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 1) clipped.push({ text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50), sw: el.scrollWidth, cw: el.clientWidth, fs: cs.fontSize });
  }
  // font boyutu -> örnek metin
  const fsSamples: Record<string, string[]> = {};
  for (const el of Array.from(document.querySelectorAll('main *')) as HTMLElement[]) {
    if (!vis(el)) continue;
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
    if (!own) continue;
    const fs = getComputedStyle(el).fontSize;
    (fsSamples[fs] ??= []).push((el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24));
  }
  const fs = Object.fromEntries(Object.entries(fsSamples).map(([k, v]) => [k, { n: v.length, ex: v.slice(0, 4) }]));
  return { cards: cardInfo, clipped: clipped.slice(0, 20), fs };
}

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: W < 500, hasTouch: W < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  const out: Record<string, unknown> = {};
  for (const route of ROUTES) {
    await openRoute(page, { route, as: 'admin', base });
    await page.waitForTimeout(600);
    out[route] = await page.evaluate(`(() => { const __name = (f) => f; return (${collect.toString()})(); })()`);
  }
  console.log(JSON.stringify(out, null, 1));
  await ctx.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
