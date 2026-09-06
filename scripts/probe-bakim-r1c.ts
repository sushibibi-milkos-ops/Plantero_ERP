import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const collect = () => {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="kpi-card"], [data-testid="kpi-card"]'));
  const list = cards.map((c) => {
    const r = c.getBoundingClientRect();
    // en alttaki metin taşıyan çocuk
    let lastText = 0;
    for (const el of Array.from(c.querySelectorAll<HTMLElement>('*'))) {
      let hasText = false;
      for (const n of Array.from(el.childNodes)) if (n.nodeType === 3 && (n.textContent||'').trim()) hasText = true;
      if (!hasText) continue;
      const b = el.getBoundingClientRect();
      if (b.height > 0 && b.bottom > lastText) lastText = b.bottom;
    }
    return { h: Math.round(r.height), w: Math.round(r.width), emptyBottom: Math.round(r.bottom - lastText), text: (c.textContent||'').replace(/\s+/g,' ').slice(0, 40) };
  });
  const icons = document.querySelectorAll('[data-slot="kpi-card"] svg').length;
  return { cards: list, icons, count: cards.length };
};

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  for (const route of ['/bakim/makineler', '/kokpit', '/depo/stok']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await openRoute(page, { route, base, as: 'admin' });
    console.log(JSON.stringify({ route, ...(await page.evaluate(collect)) }));
    await context.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
