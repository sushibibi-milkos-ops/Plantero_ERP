/** Tur 5 — /bakim/is-emirleri/yeni masaüstü hizalama + boşluk, /bakim/oee makine tablosu boş durumu. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collectYeni = () => {
  const h1 = document.querySelector<HTMLElement>('main h1');
  const qr = document.querySelector<HTMLElement>('main input[placeholder*="QR"]');
  const rail = Array.from(document.querySelectorAll<HTMLElement>('main *')).find((e) => (e.textContent || '').startsWith('SON BİLDİRİLEN ARIZALAR'));
  const machinesCard = Array.from(document.querySelectorAll<HTMLElement>('main *')).find((e) => /^MAKİNELER \(\d+\)/.test((e.textContent || '').trim()));
  // sol kolonun en alt içerik noktası
  const leftCol = qr ? qr.closest('div[class*="max-w"], main > div') as HTMLElement | null : null;
  const cancel = Array.from(document.querySelectorAll<HTMLElement>('main button')).find((b) => (b.textContent || '').trim() === 'Vazgeç');
  const docH = document.documentElement.scrollHeight;
  // makine listesi kartındaki son satırın kart altına göre konumu (kırpma)
  let clippedRow: unknown = null;
  if (machinesCard) {
    const cardBox = machinesCard.getBoundingClientRect();
    const rows = Array.from(machinesCard.querySelectorAll<HTMLElement>('li, a, button')).filter((r) => r.getBoundingClientRect().height > 20);
    const last = rows[rows.length - 1];
    if (last) {
      const lb = last.getBoundingClientRect();
      clippedRow = { rowCount: rows.length, lastBottom: Math.round(lb.bottom), cardBottom: Math.round(cardBox.bottom), overflowPx: Math.round(lb.bottom - cardBox.bottom) };
    }
  }
  return {
    h1: h1 ? [Math.round(h1.getBoundingClientRect().left), Math.round(h1.getBoundingClientRect().right)] : null,
    qr: qr ? [Math.round(qr.getBoundingClientRect().left), Math.round(qr.getBoundingClientRect().right), Math.round(qr.getBoundingClientRect().top)] : null,
    leftCol: leftCol ? [Math.round(leftCol.getBoundingClientRect().left), Math.round(leftCol.getBoundingClientRect().right)] : null,
    rail: rail ? [Math.round((rail as HTMLElement).getBoundingClientRect().left), Math.round((rail as HTMLElement).getBoundingClientRect().right)] : null,
    machinesCard: machinesCard ? [Math.round((machinesCard as HTMLElement).getBoundingClientRect().left), Math.round((machinesCard as HTMLElement).getBoundingClientRect().right), Math.round((machinesCard as HTMLElement).getBoundingClientRect().bottom)] : null,
    cancelBottom: cancel ? Math.round(cancel.getBoundingClientRect().bottom) : null,
    docH, viewportH: window.innerHeight, viewportW: window.innerWidth,
    h1FormGapPx: h1 && qr ? Math.round(qr.getBoundingClientRect().left - h1.getBoundingClientRect().left) : null,
    emptyBelowLeft: cancel ? Math.round(docH - cancel.getBoundingClientRect().bottom - window.scrollY) : null,
    clippedRow,
  };
};

const collectOee = () => {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('main section, main div[class*="rounded"]'));
  const machineCard = cards.find((c) => (c.textContent || '').includes('MAKİNE BAZLI OEE'));
  const empty = machineCard ? machineCard.querySelector<HTMLElement>('[data-slot="empty-state"], [class*="EmptyState"]') : null;
  const emptyText = machineCard ? (machineCard.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200) : null;
  const tooltip = document.querySelector<HTMLElement>('.recharts-tooltip-wrapper');
  const tooltipVisible = tooltip ? getComputedStyle(tooltip).visibility !== 'hidden' && tooltip.getBoundingClientRect().width > 0 : false;
  const strokes = Array.from(document.querySelectorAll<SVGPathElement>('.recharts-line-curve')).map((p) => ({ stroke: p.getAttribute('stroke'), dash: p.getAttribute('stroke-dasharray') }));
  return {
    machineCard: machineCard ? { h: Math.round(machineCard.getBoundingClientRect().height), t: Math.round(machineCard.getBoundingClientRect().top), b: Math.round(machineCard.getBoundingClientRect().bottom) } : null,
    hasEmptyStateComponent: !!empty,
    emptyText,
    docH: document.documentElement.scrollHeight,
    tooltipVisible,
    strokes,
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
