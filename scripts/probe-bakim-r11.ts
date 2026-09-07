/**
 * Tur 11 kanıt betiği (bakim-makineler-07 + bakim-isemirleri-detay-12 kapanış ölçümü).
 * 1) /bakim/makineler @390x844: mobil kartların innerText'inde etiketsiz çıplak tamsayı kalmadığını,
 *    metrik yuvasının artık dd.MM.yyyy tarihi (ya da "—") bastığını doğrular.
 * 2) /bakim/is-emirleri/<id> @1440x900: OrderTimeline'da "Yapılıyor" (in_progress) ve "Tamamlandı"
 *    (done) noktalarının anatomi (dolgu vs. halka) farkını doğrular.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function machinesCards() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: '/bakim/makineler', as: 'admin' });
  const res = await page.evaluate(() => {
    const lis = Array.from(document.querySelectorAll('ul > li')).filter((li) => li.getBoundingClientRect().height > 40) as HTMLElement[];
    const dateRe = /\d{2}\.\d{2}\.\d{4}/;
    const bareIntRe = /^\d+$/;
    return lis.map((li) => {
      const text = (li.innerText || '').trim();
      const lines = text.split('\n').map((s) => s.trim());
      const lastLine = lines[lines.length - 1] ?? '';
      return {
        text: text.replace(/\n/g, ' / '),
        hasDate: dateRe.test(text),
        lastLineIsBareInt: bareIntRe.test(lastLine),
      };
    });
  });
  await browser.close();
  return res;
}

async function timelineDots() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  // İş emri listesinden "Yapılıyor" + "Tamamlandı" olayı olan bir kayıt ara.
  // `orderId` argv[2]'den gelir (psql ile audit_log'dan hem "in_progress" hem "done" durum
  // geçişi bulunan bir maintenance_orders.id seçilip betiğe verilir — DataTable satırları <a>
  // değil onClick/router.push ile gezindiği için sabit id doğrudan navigasyon daha güvenilir).
  const orderId = process.argv[2];
  if (!orderId) {
    await browser.close();
    return { error: 'orderId argümanı verilmedi' };
  }
  await openRoute(page, { base, route: `/bakim/is-emirleri/${orderId}`, as: 'admin' });
  const rows = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h2')).find((h) => (h.textContent || '').includes('Olay geçmişi'));
    const ol = heading?.parentElement?.querySelector('ol') ?? null;
    const items = ol ? (Array.from(ol.children) as HTMLElement[]) : [];
    return items.map((li) => {
      const label = li.querySelector('span.font-medium')?.textContent?.trim() ?? '';
      const dot = li.querySelector('span[aria-hidden]') as HTMLElement | null;
      if (!dot) return { label, dot: null };
      const cs = getComputedStyle(dot);
      return {
        label,
        dot: {
          bg: cs.backgroundColor,
          borderWidth: cs.borderWidth,
          borderColor: cs.borderColor,
          animation: cs.animationName,
        },
      };
    });
  });
  await browser.close();
  return { href: `/bakim/is-emirleri/${orderId}`, rows };
}

(async () => {
  const out: any = {};
  out.makineler = await machinesCards();
  out.timeline = await timelineDots();
  process.stdout.write(JSON.stringify(out, null, 1) + '\n');
})();
