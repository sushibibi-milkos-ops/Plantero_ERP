/** Tur 10: iş emri detayında "Olay geçmişi" zaman çizgisi nokta renkleri (primary vs success ayırt edilebilirliği). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const ROUTE = '/bakim/is-emirleri/9eb9086f-1ab6-46fe-8eac-8af18c53cd9f';

(async () => {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: ROUTE, as: 'admin' });
  const res = await page.evaluate(() => {
    const head = Array.from(document.querySelectorAll('*')).find((e) => (e.textContent || '').trim() === 'OLAY GEÇMİŞİ');
    const section = head?.parentElement as HTMLElement | undefined;
    const rows = section ? Array.from(section.querySelectorAll('li, div')).filter((e) => /Bildirildi|Yapılıyor|Tamamlandı|Planlandı|İptal/.test(e.textContent || '') && e.querySelector('span,i,svg')) : [];
    const dots: any[] = [];
    (section ? Array.from(section.querySelectorAll('span,i')) : []).forEach((s) => {
      const el = s as HTMLElement;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.width <= 14 && Math.abs(r.width - r.height) < 2) {
        dots.push({ bg: getComputedStyle(el).backgroundColor, w: Math.round(r.width), y: Math.round(r.top), label: (el.parentElement?.textContent || '').trim().slice(0, 30) });
      }
    });
    // globals token değerleri
    const cs = getComputedStyle(document.documentElement);
    return {
      dots,
      rowCount: rows.length,
      tokens: { primary: cs.getPropertyValue('--primary').trim(), success: cs.getPropertyValue('--success').trim(), warning: cs.getPropertyValue('--warning').trim(), info: cs.getPropertyValue('--info').trim() },
    };
  });
  await browser.close();
  process.stdout.write(JSON.stringify(res, null, 1) + '\n');
})();
