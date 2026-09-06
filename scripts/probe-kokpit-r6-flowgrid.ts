/**
 * Tur 6 doğrulama: FlowGrid'in İKİNCİ veri durumunda (Bugün + Son aktiviteler boş) da kolon dengesini
 * koruduğunu kanıtlar. Gerçek "gece yarısı" durumunu sunucu tarihini değiştirmeden simüle etmek için
 * sayfa DOM'unda "Bugün" ve "Son aktiviteler" bölümlerinin listelerini kod ile BİREBİR AYNI EmptyState
 * (compact, `gm-dashboard.tsx`'teki gerçek prop'larla — description/action dahil) markup'ıyla değiştirir,
 * sonra colSpread'i probe-kokpit-r4.ts ile AYNI mantıkla yeniden hesaplar.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const inject = () => {
  const main = document.querySelector('main') ?? document.body;
  const sections = Array.from(main.querySelectorAll<HTMLElement>('section'));
  const emptyHtml = (title: string, withActionDescription: boolean) => `
    <div class="flex flex-col items-center justify-center text-center gap-2 px-4 py-10">
      <div class="grid place-items-center rounded-full bg-muted text-muted-foreground size-9"></div>
      <div class="space-y-1">
        <div class="font-medium text-sm">${title}</div>
        ${withActionDescription ? '<div class="mx-auto max-w-sm text-[13px] text-muted-foreground">Sevkiyat, iş emri, mal kabul veya fatura oluştuğunda burada görünür.</div>' : ''}
      </div>
      ${withActionDescription ? '<div class="mt-1"><button class="h-11 md:h-8 inline-flex items-center gap-1 rounded-md border px-3 text-xs">Yeni sipariş oluştur</button></div>' : ''}
    </div>`;
  for (const s of sections) {
    const h2 = s.querySelector('h2,h3');
    const title = (h2?.textContent ?? '').trim();
    if (title === 'Bugün') {
      const ul = s.querySelector('ul');
      if (ul) ul.outerHTML = emptyHtml('Bugün henüz belge yok', true);
    }
    if (title === 'Son aktiviteler') {
      const ul = s.querySelector('ul');
      if (ul) ul.outerHTML = emptyHtml('Henüz aktivite yok', false);
    }
  }
};

const measureColumns = () => {
  const main = document.querySelector('main') ?? document.body;
  const vis = (el: Element) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const sectionEls = Array.from(main.querySelectorAll<HTMLElement>('section')).filter(vis);
  const sections = sectionEls.map((s) => {
    const r = s.getBoundingClientRect();
    return { title: (s.querySelector('h2,h3')?.textContent ?? '').trim(), left: Math.round(r.left), top: Math.round(r.top + scrollY), bottom: Math.round(r.bottom + scrollY), h: Math.round(r.height) };
  });
  const byLeft = new Map<number, { bottom: number; last: string }>();
  for (const s of sections) {
    const cur = byLeft.get(s.left);
    if (!cur || s.bottom > cur.bottom) byLeft.set(s.left, { bottom: s.bottom, last: s.title });
  }
  const columns = Array.from(byLeft.entries()).map(([left, v]) => ({ left, bottom: v.bottom, last: v.last }));
  const colSpread = columns.length > 1 ? Math.max(...columns.map((c) => c.bottom)) - Math.min(...columns.map((c) => c.bottom)) : 0;
  return { sections, columns, colSpread };
};

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { as: 'admin', vp: { width: 1440, height: 900 }, base: defaultBaseUrl(), route: '/kokpit' });
  const wrap = (f: () => unknown) => `(() => { const __name = (f) => f; return (${f.toString()})(); })()`;
  const before = await page.evaluate(wrap(measureColumns));
  await page.evaluate(wrap(inject));
  const after = await page.evaluate(wrap(measureColumns));
  console.log(JSON.stringify({ before, after }, null, 1));
  await ctx.close();
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
