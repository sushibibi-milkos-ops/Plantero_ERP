import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  // 1) KPI kart yüksekliği (grid varyantı) — /bakim/makineler
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await openRoute(page, { route: '/bakim/makineler', base, as: 'admin' });
    const r = await page.evaluate(() => {
      const grid = document.querySelector('main .grid');
      const kids = grid ? Array.from(grid.children).map((c) => Math.round(c.getBoundingClientRect().height)) : [];
      const table = document.querySelector('table');
      const tableTop = table ? Math.round(table.getBoundingClientRect().top) : null;
      // ilk ekranda görünen satır sayısı
      const rows = Array.from(document.querySelectorAll('tbody tr')).filter((tr) => tr.getBoundingClientRect().bottom <= window.innerHeight).length;
      // Çalışma saati sütunundaki 0 değerlerinin rengi
      const cells = Array.from(document.querySelectorAll('tbody tr')).slice(0, 3).map((tr) => Array.from(tr.children).map((td) => ({ t: (td.textContent||'').trim().slice(0,14), color: getComputedStyle(td.querySelector('*') ?? td).color })));
      return { kpiHeights: kids, tableTop, rowsAboveFold: rows, cells };
    });
    console.log(JSON.stringify({ route: '/bakim/makineler', ...r }));
    await ctx.close();
  }
  // 2) Mobil kart yüksekliği kırılımı
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await openRoute(page, { route: '/bakim/makineler', base, as: 'admin' });
    const r = await page.evaluate(() => {
      const li = document.querySelector('main ul > li');
      if (!li) return null;
      const cs = getComputedStyle(li.firstElementChild ?? li);
      return { h: Math.round(li.getBoundingClientRect().height), pad: `${cs.paddingTop}/${cs.paddingBottom}`, inner: (li.textContent||'').replace(/\s+/g,' ').slice(0,60) };
    });
    console.log(JSON.stringify({ route: '/bakim/makineler mobil kart', ...r }));
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
