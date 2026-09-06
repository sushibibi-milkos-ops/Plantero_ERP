/** Tur 3 kokpit ek probu: StatStrip mobil 2x2 kırılımını doğrula (kokpit-kdv-strip-mobile-01). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

function parseArgs(argv: string[]) {
  let as = 'admin';
  let vp = { width: 390, height: 844 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--as') as = argv[++i]!;
    else if (a === '--viewport') {
      const m = /^(\d+)x(\d+)$/.exec(argv[++i]!)!;
      vp = { width: Number(m[1]), height: Number(m[2]) };
    }
  }
  return { as, vp, base: defaultBaseUrl(), route: '/kokpit' };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: opts.vp, deviceScaleFactor: 2, isMobile: opts.vp.width < 700, hasTouch: opts.vp.width < 700, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, opts);

  const probe = () => {
    const txt = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const out: any[] = [];
    for (const st of Array.from(document.querySelectorAll<HTMLElement>('[class*="divide-x"]'))) {
      const section = st.closest('section');
      const title = txt(section?.querySelector('h2,h3') ?? null).slice(0, 30);
      const kids = Array.from(st.children) as HTMLElement[];
      const rects = kids.map((k) => {
        const r = k.getBoundingClientRect();
        return { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      });
      const labels = kids.map((k) => {
        const label = k.querySelector('div:last-child');
        return txt(label);
      });
      out.push({ title, n: kids.length, rects, labels });
    }
    return out;
  };
  const out = (await page.evaluate(`(() => { const __name=(f)=>f; return (${probe.toString()})(); })()`)) as any;
  console.log(JSON.stringify({ as: opts.as, viewport: `${opts.vp.width}x${opts.vp.height}`, strips: out }, null, 1));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
