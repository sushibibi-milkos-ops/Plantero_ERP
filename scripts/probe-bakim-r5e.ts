/** Tur 5 — /bakim/is-emirleri/yeni sağ ray geometrisi; /bakim/oee makine kartı + mobil tooltip. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collectYeni = () => {
  (globalThis as any).__name = (globalThis as any).__name || function (f: unknown) { return f; };
  const all = Array.from(document.querySelectorAll<HTMLElement>('main *'));
  const railLabel = all.find((e) => e.children.length === 0 && /son bildirilen arızalar/i.test((e.textContent || '')));
  const machLabel = all.find((e) => e.children.length === 0 && /^makineler \(\d+\)$/i.test((e.textContent || '').trim()));
  const railCard = railLabel ? railLabel.closest('div[class*="rounded"], section') as HTMLElement | null : null;
  const machCard = machLabel ? machLabel.closest('div[class*="rounded"], section') as HTMLElement | null : null;
  const qr = document.querySelector<HTMLElement>('main input[placeholder*="QR"]');
  const cancel = all.find((b) => b.tagName === 'BUTTON' && (b.textContent || '').trim() === 'Vazgeç');
  const box = (e: Element | null) => (e ? [Math.round(e.getBoundingClientRect().left), Math.round(e.getBoundingClientRect().right), Math.round(e.getBoundingClientRect().top), Math.round(e.getBoundingClientRect().bottom)] : null);
  let clip = null as unknown;
  if (machCard) {
    const cb = machCard.getBoundingClientRect();
    const rows = Array.from(machCard.querySelectorAll<HTMLElement>('li,a,button')).filter((r) => r.getBoundingClientRect().height > 20);
    const last = rows[rows.length - 1];
    const scroller = Array.from(machCard.querySelectorAll<HTMLElement>('*')).find((d) => d.scrollHeight > d.clientHeight + 4);
    clip = { rows: rows.length, cardH: Math.round(cb.height), lastRowBottom: last ? Math.round(last.getBoundingClientRect().bottom) : null, cardBottom: Math.round(cb.bottom), scrollerCls: scroller ? (scroller.getAttribute('class') || '').slice(0, 60) : null, scrollH: scroller ? scroller.scrollHeight : null, clientH: scroller ? scroller.clientHeight : null };
  }
  return { qr: box(qr), railCard: box(railCard), machCard: box(machCard), cancel: box(cancel ?? null), docH: document.documentElement.scrollHeight, vw: window.innerWidth, clip };
};

const collectOee = () => {
  (globalThis as any).__name = (globalThis as any).__name || function (f: unknown) { return f; };
  const all = Array.from(document.querySelectorAll<HTMLElement>('main *'));
  const lbl = all.find((e) => e.children.length === 0 && /makine bazlı oee/i.test(e.textContent || ''));
  const card = lbl ? lbl.closest('div[class*="rounded"], section') as HTMLElement | null : null;
  const tips = Array.from(document.querySelectorAll<HTMLElement>('.recharts-tooltip-wrapper')).map((t) => ({ w: Math.round(t.getBoundingClientRect().width), h: Math.round(t.getBoundingClientRect().height), vis: getComputedStyle(t).visibility, op: getComputedStyle(t).opacity }));
  const curves = Array.from(document.querySelectorAll<SVGPathElement>('svg path[stroke]')).filter((p) => (p.getAttribute('stroke') || '') !== 'none' && Number(p.getAttribute('stroke-width') || 0) >= 1).slice(0, 10).map((p) => ({ stroke: p.getAttribute('stroke'), dash: p.getAttribute('stroke-dasharray'), w: p.getAttribute('stroke-width') }));
  return {
    card: card ? { l: Math.round(card.getBoundingClientRect().left), r: Math.round(card.getBoundingClientRect().right), t: Math.round(card.getBoundingClientRect().top), b: Math.round(card.getBoundingClientRect().bottom), h: Math.round(card.getBoundingClientRect().height), text: (card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180) } : null,
    docH: document.documentElement.scrollHeight, vh: window.innerHeight,
    tips, curves,
  };
};

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    let ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    let page = await ctx.newPage();
    await openRoute(page, { route: '/bakim/is-emirleri/yeni', base, as: 'admin' });
    out[`yeni ${vp.width}`] = await page.evaluate(collectYeni);
    await ctx.close();
    ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    page = await ctx.newPage();
    await openRoute(page, { route: '/bakim/oee', base, as: 'admin' });
    out[`oee ${vp.width}`] = await page.evaluate(collectOee);
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
