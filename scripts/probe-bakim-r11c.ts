import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 1) İş emri detay @390 — kontrol listesi checkbox dokunma hedefi + olay sırası
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/bakim/is-emirleri/42f49874-677c-4376-81b0-0786ad6f093d', as: 'admin' });
    out.checklist = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('button[data-slot="checkbox"]'));
      return boxes.map((b) => {
        const r = b.getBoundingClientRect();
        const label = b.closest('label') ?? b.parentElement;
        const lr = label?.getBoundingClientRect();
        return {
          w: +r.width.toFixed(1), h: +r.height.toFixed(1),
          disabled: (b as HTMLButtonElement).disabled,
          ariaDisabled: b.getAttribute('aria-disabled'),
          pointerEvents: getComputedStyle(b).pointerEvents,
          checked: b.getAttribute('data-state') ?? b.getAttribute('aria-checked'),
          wrapperTag: label?.tagName, wrapperH: lr ? +lr.height.toFixed(1) : null, wrapperW: lr ? +lr.width.toFixed(1) : null,
        };
      });
    });
    out.timeline = await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('*')).find((e) => e.textContent?.trim() === 'Olay geçmişi' || e.textContent?.trim() === 'OLAY GEÇMİŞİ');
      const sec = h?.parentElement;
      const items = sec ? Array.from(sec.querySelectorAll('li')) : [];
      return items.map((li) => (li as HTMLElement).innerText.replace(/\n/g, ' | '));
    });
    // periyodik plan linki
    out.planLink = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a')).find((x) => x.textContent?.includes('Haftalık stick nozul'));
      if (!a) return null;
      const r = a.getBoundingClientRect();
      return { text: a.textContent?.trim().slice(0, 40), w: +r.width.toFixed(1), h: +r.height.toFixed(1), display: getComputedStyle(a).display };
    });
    // 2 kolonlu tanım ızgarası mı?
    out.defGrid = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('dl,div')).find((d) => /grid/.test(getComputedStyle(d).display) && d.textContent?.includes('Sorumlu') && d.textContent?.includes('Bildirilme'));
      return el ? { cols: getComputedStyle(el).gridTemplateColumns, w: +el.getBoundingClientRect().width.toFixed(1) } : null;
    });
    await ctx.close();
  }

  // 2) Makineler @390 mobil kart son satır
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/bakim/makineler', as: 'admin' });
    out.makinelerCards = await page.evaluate(() => {
      const lis = Array.from(document.querySelectorAll('ul > li'));
      const texts = lis.map((li) => (li as HTMLElement).innerText.trim());
      const bare = texts.filter((t) => /^\d+$/.test(t.split('\n').pop()!.trim()));
      const dated = texts.filter((t) => /\d{2}\.\d{2}\.\d{4}/.test(t));
      const dash = texts.filter((t) => t.split('\n').pop()!.trim() === '—');
      return { count: texts.length, bareIntLast: bare.length, withDate: dated.length, withDash: dash.length, sample: texts.slice(0, 3) };
    });
    out.kpiStrip390 = await page.evaluate(() => {
      const scrollers = Array.from(document.querySelectorAll('div')).filter((d) => d.scrollWidth > d.clientWidth + 4 && d.clientWidth > 200);
      return scrollers.slice(0, 3).map((d) => ({ sw: d.scrollWidth, cw: d.clientWidth, cls: d.className.slice(0, 90), text: (d as HTMLElement).innerText.slice(0, 60).replace(/\n/g, '/') }));
    });
    await ctx.close();
  }

  // 3) OEE @390 kpi strip
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/bakim/oee', as: 'admin' });
    out.oeeKpi = await page.evaluate(() => {
      const scrollers = Array.from(document.querySelectorAll('div')).filter((d) => d.scrollWidth > d.clientWidth + 4 && d.clientWidth > 200);
      return scrollers.map((d) => ({ sw: d.scrollWidth, cw: d.clientWidth, cls: d.className.slice(0, 90), text: (d as HTMLElement).innerText.slice(0, 60).replace(/\n/g, '/') }));
    });
    await ctx.close();
  }

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
