/** Tur 5 kritik geçişi — ölçüm probu (yalnızca okur, hiçbir şey değiştirmez). */
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();
const PO = process.env.PO_ID ?? '';

async function open(browser: Awaited<ReturnType<typeof launchBrowser>>, route: string, w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route, as: 'satin_alma' });
  return { ctx, page };
}

const fontsFn = () => {
  const els = Array.from(document.querySelectorAll('main *')).filter((e) => e.children.length === 0 && (e.textContent ?? '').trim().length > 0);
  const sizes = new Map<string, number>();
  for (const e of els) {
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const cs = getComputedStyle(e);
    sizes.set(`${Math.round(parseFloat(cs.fontSize))}/${cs.fontWeight}`, (sizes.get(`${Math.round(parseFloat(cs.fontSize))}/${cs.fontWeight}`) ?? 0) + 1);
  }
  const pure = new Set(Array.from(sizes.keys()).map((k) => k.split('/')[0]!));
  return { pairs: Object.fromEntries(sizes), pureSizeCount: pure.size, pureSizes: Array.from(pure).sort((a, b) => Number(b) - Number(a)) };
};

const scrollersFn = () => Array.from(document.querySelectorAll('main *')).map((e) => {
  const el = e as HTMLElement;
  const cs = getComputedStyle(el);
  if (!/auto|scroll/.test(cs.overflowX)) return null;
  return { cls: el.className.toString().slice(0, 90), sw: el.scrollWidth, cw: el.clientWidth, over: el.scrollWidth - el.clientWidth };
}).filter(Boolean);

const primaryCountFn = () => {
  const probe = document.createElement('div');
  probe.style.color = 'var(--primary)'; document.body.appendChild(probe);
  const primary = getComputedStyle(probe).color; probe.remove();
  const hits: string[] = [];
  for (const e of Array.from(document.querySelectorAll('main *'))) {
    const el = e as HTMLElement; const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const cs = getComputedStyle(el);
    if (cs.backgroundColor === primary) hits.push(`${el.tagName}.bg "${(el.textContent ?? '').trim().slice(0, 22)}"`);
  }
  return { primary, count: hits.length, hits: hits.slice(0, 12) };
};

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // A) kritik-stok masaüstü: sütun doluluk oranı + tablo scroller + primary
  {
    const { ctx, page } = await open(browser, '/satin-alma/kritik-stok');
    out.kritikStokDesktop = {
      perCol: await page.evaluate(() => {
        const headers = Array.from(document.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
        const rows = Array.from(document.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()));
        return headers.map((h, i) => {
          const vals = rows.map((r) => r[i] ?? '');
          const dash = vals.filter((v) => v === '—' || v === '').length;
          const uniq = new Set(vals).size;
          return { header: h, n: vals.length, dash, uniq, sample: vals[0] };
        });
      }),
      scrollers: await page.evaluate(scrollersFn),
      primary: await page.evaluate(primaryCountFn),
      fonts: await page.evaluate(fontsFn),
    };
    await ctx.close();
  }
  // B) kritik-stok mobil: kart içeriği
  {
    const { ctx, page } = await open(browser, '/satin-alma/kritik-stok', 390, 844);
    out.kritikStokMobile = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('main ul > li')).slice(0, 4);
      return cards.map((c) => ({ text: (c.textContent ?? '').replace(/\s+/g, ' ').trim(), h: Math.round(c.getBoundingClientRect().height) }));
    });
    await ctx.close();
  }
  // C) tedarikciler masaüstü: scroller taşması + son sütun kırpma + switch sayısı
  {
    const { ctx, page } = await open(browser, '/satin-alma/tedarikciler');
    out.tedarikcilerDesktop = {
      scrollers: await page.evaluate(scrollersFn),
      table: await page.evaluate(() => {
        const t = document.querySelector('table') as HTMLElement | null;
        const headers = Array.from(document.querySelectorAll('thead th')).map((th) => {
          const r = th.getBoundingClientRect();
          return { t: (th.textContent ?? '').trim(), left: Math.round(r.left), right: Math.round(r.right) };
        });
        const main = document.querySelector('main') as HTMLElement;
        const mr = main.getBoundingClientRect();
        return { tableWidth: t ? Math.round(t.getBoundingClientRect().width) : null, headers, mainRight: Math.round(mr.right) };
      }),
      switches: await page.evaluate(() => Array.from(document.querySelectorAll('[role="switch"]')).map((s) => {
        const r = s.getBoundingClientRect();
        return { aria: s.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height), bg: getComputedStyle(s).backgroundColor };
      })),
      primary: await page.evaluate(primaryCountFn),
      fonts: await page.evaluate(fontsFn),
    };
    await ctx.close();
  }
  // D) tedarikciler mobil: kart içeriği + switch var mı + '·' baş harf
  {
    const { ctx, page } = await open(browser, '/satin-alma/tedarikciler', 390, 844);
    out.tedarikcilerMobile = {
      switches: await page.locator('[role="switch"]').count(),
      cards: await page.evaluate(() => Array.from(document.querySelectorAll('main ul > li')).map((c) => {
        const rows = Array.from(c.querySelectorAll('*')).filter((e) => e.children.length === 0 && (e.textContent ?? '').trim());
        return { text: (c.textContent ?? '').replace(/\s+/g, ' ').trim(), h: Math.round(c.getBoundingClientRect().height), leaves: rows.map((r) => (r.textContent ?? '').trim()).slice(0, 12) };
      })),
      startsWithDot: await page.evaluate(() => {
        // ikinci satır metin akışı: kartın alt satırındaki görünür metin
        return Array.from(document.querySelectorAll('main ul > li')).map((c) => {
          const el = c.querySelector('[class*="justify-between"]:last-of-type') ?? c.lastElementChild;
          const t = (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
          return t;
        });
      }),
    };
    await ctx.close();
  }
  // E) PO detay: aynı sayının kaç kez ve hangi kademede basıldığı + başlık büyük harf + zincir kartı hizası
  if (PO) {
    const { ctx, page } = await open(browser, `/satin-alma/siparisler/${PO}`);
    out.poDetay = {
      fonts: await page.evaluate(fontsFn),
      totalOccurrences: await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('main *')).filter((e) => e.children.length === 0);
        return els.filter((e) => (e.textContent ?? '').replace(/\s+/g, '').includes('113.040,00')).map((e) => {
          const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
          return { text: (e.textContent ?? '').trim(), size: Math.round(parseFloat(cs.fontSize)), weight: cs.fontWeight, top: Math.round(r.top), visible: r.width > 0 };
        });
      }),
      headers: await page.evaluate(() => Array.from(document.querySelectorAll('thead th')).map((th) => ({ t: (th.textContent ?? '').trim(), tt: getComputedStyle(th).textTransform, size: Math.round(parseFloat(getComputedStyle(th).fontSize)), ls: getComputedStyle(th).letterSpacing }))),
      chainCards: await page.evaluate(() => Array.from(document.querySelectorAll('main a,main div')).filter((e) => /^(PO|PINV|GR)-2026-/.test((e.textContent ?? '').trim())).map((e) => {
        const r = e.getBoundingClientRect();
        return { t: (e.textContent ?? '').trim().slice(0, 20), top: Math.round(r.top), left: Math.round(r.left) };
      })),
      scrollers: await page.evaluate(scrollersFn),
      primary: await page.evaluate(primaryCountFn),
    };
    await ctx.close();
  }
  // F) siparisler masaüstü: başlık büyük harf karşılaştırması
  {
    const { ctx, page } = await open(browser, '/satin-alma/siparisler');
    out.siparisler = {
      headers: await page.evaluate(() => Array.from(document.querySelectorAll('thead th')).map((th) => ({ t: (th.textContent ?? '').trim(), tt: getComputedStyle(th).textTransform, size: Math.round(parseFloat(getComputedStyle(th).fontSize)) }))),
      scrollers: await page.evaluate(scrollersFn),
      primary: await page.evaluate(primaryCountFn),
      fonts: await page.evaluate(fontsFn),
    };
    await ctx.close();
  }
  // G) onay + yeni: fonts/primary
  for (const [k, r] of [['onay', '/satin-alma/onay-kuyrugu'], ['yeni', '/satin-alma/siparisler/yeni']] as const) {
    const { ctx, page } = await open(browser, r);
    out[k] = { fonts: await page.evaluate(fontsFn), primary: await page.evaluate(primaryCountFn), scrollers: await page.evaluate(scrollersFn) };
    await ctx.close();
  }

  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r5c.json', JSON.stringify(out, null, 1));
  console.log('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
