import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const out: any = {};
  for (const route of ['/ihracat/sevkiyatlar', '/ihracat/kurlar']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: BASE, route, as: 'admin' });
    out[route] = await page.evaluate(() => {
      const lis = Array.from(document.querySelectorAll('ul > li')).slice(0, 4) as HTMLElement[];
      return lis.map((li) => {
        const seps = Array.from(li.querySelectorAll('span[aria-hidden]')).filter((s) => (s.textContent || '').includes('·')) as HTMLElement[];
        return {
          text: (li.innerText || '').replace(/\n/g, ' | '),
          h: Math.round(li.getBoundingClientRect().height * 10) / 10,
          seps: seps.map((s) => {
            const r = s.getBoundingClientRect();
            const prev = s.parentElement!.previousElementSibling as HTMLElement | null;
            const prevR = prev?.getBoundingClientRect();
            // find preceding text node box via Range
            return { raw: JSON.stringify(s.textContent), w: Math.round(r.width * 10) / 10, x: Math.round(r.x * 10) / 10, prevRight: prevR ? Math.round(prevR.right * 10) / 10 : null, prevText: prev?.textContent?.slice(0, 30) ?? null };
          }),
        };
      });
    });
    // subtitle + metachain geometry
    out[route + ':chain'] = await page.evaluate(() => {
      const chains = Array.from(document.querySelectorAll('span.max-w-\\[55\\%\\]')) as HTMLElement[];
      return chains.slice(0, 3).map((c) => {
        const r = c.getBoundingClientRect();
        const prev = c.previousElementSibling as HTMLElement | null;
        const pr = prev?.getBoundingClientRect();
        const firstSep = c.querySelector('span[aria-hidden]') as HTMLElement | null;
        const fr = firstSep?.getBoundingClientRect();
        return {
          chainText: c.textContent, chainX: Math.round(r.x * 10) / 10,
          prevText: prev?.textContent?.slice(0, 40) ?? null, prevRight: pr ? Math.round(pr.right * 10) / 10 : null,
          gap: pr ? Math.round((r.x - pr.right) * 10) / 10 : null,
          sepW: fr ? Math.round(fr.width * 10) / 10 : null,
          sepX: fr ? Math.round(fr.x * 10) / 10 : null,
          display: getComputedStyle(c).display,
        };
      });
    });
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
