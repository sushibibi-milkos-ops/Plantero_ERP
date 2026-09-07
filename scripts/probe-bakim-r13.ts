/**
 * Tur 13 — bakim modülü kritik ölçümleri.
 * 1) /bakim/is-emirleri @390: mobil kart rozet sağ kenarları (shell aksiyon oluğu düzeltmesi doğrulaması)
 * 2) /bakim/oee @1440: yüzde sütunlarında ondalık basamak kümesi (bakim-oee-05)
 * 3) /bakim/oee + /bakim/makineler @390: KpiStripRow scrollWidth/clientWidth (bakim-oee-04)
 * 4) /bakim/is-emirleri/<done> @1440: animasyonlu öğe sayısı (bakim-isemirleri-detay-14)
 * 5) 7 rota: hesaplanmış stilde transition-property:all / süre ≥300ms / ease-in taraması
 * 6) /bakim/oee: OEE trend grafiği çizgi stilleri (renk + dash) ayırt edilebilirlik
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const DONE_ORDER = '/bakim/is-emirleri/e310fac1-bb23-458d-8834-fc4cfbee0b9b';
const OPEN_ORDER = '/bakim/is-emirleri/6f4f81ff-e42b-4c00-ab31-73cddc12cec4';
const MACHINE = '/bakim/makineler/e9446ff8-da45-418f-be58-5905fd4546c1';

const ROUTES = [
  '/bakim/makineler',
  MACHINE,
  '/bakim/planlar',
  '/bakim/is-emirleri',
  DONE_ORDER,
  '/bakim/is-emirleri/yeni',
  '/bakim/oee',
];

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // --- 390px ölçümleri
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await ctx.newPage();

    await openRoute(page, { base, route: '/bakim/is-emirleri', as: 'admin' });
    out.isemirleriMobilKart = await page.evaluate(() => {
      const lis = Array.from(document.querySelectorAll('main ul > li'));
      return lis.map((li) => {
        const badge = li.querySelector('[data-slot="badge"], span[class*="rounded-full"][class*="px-"]');
        const btn = li.querySelector('button[aria-haspopup="menu"]');
        const ph = li.querySelector('span[aria-hidden]');
        const bb = badge?.getBoundingClientRect();
        const mb = btn?.getBoundingClientRect();
        const pb = ph?.getBoundingClientRect();
        return {
          text: (li as HTMLElement).innerText.split('\n')[0],
          badge: bb ? { l: Math.round(bb.left), r: Math.round(bb.right), w: Math.round(bb.width) } : null,
          menu: mb ? { l: Math.round(mb.left), r: Math.round(mb.right), w: Math.round(mb.width) } : null,
          placeholder: btn || !pb ? null : { l: Math.round(pb.left), r: Math.round(pb.right), w: Math.round(pb.width) },
          h: Math.round((li as HTMLElement).getBoundingClientRect().height * 10) / 10,
        };
      });
    });

    for (const [key, route] of [['oee', '/bakim/oee'], ['makineler', '/bakim/makineler']] as const) {
      await openRoute(page, { base, route, as: 'admin' });
      out[`kpiStrip_${key}_390`] = await page.evaluate(() => {
        const cands = Array.from(document.querySelectorAll('main div')).filter((d) => d.scrollWidth > d.clientWidth + 4 && d.querySelectorAll('[class*="tabular-nums"], .num').length >= 2);
        const strip = cands[0];
        if (!strip) return null;
        const cw = strip.clientWidth;
        const kids = Array.from(strip.children);
        const fully = kids.filter((k) => k.getBoundingClientRect().right <= strip.getBoundingClientRect().right + 0.5).length;
        return { scrollWidth: strip.scrollWidth, clientWidth: cw, cardCount: kids.length, fullyVisible: fully };
      });
    }
    await ctx.close();
  }

  // --- 1440px ölçümleri
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();

    await openRoute(page, { base, route: '/bakim/oee', as: 'admin' });
    out.oeeTables = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('table')).map((t) => {
        const heads = Array.from(t.querySelectorAll('thead th')).map((h) => (h as HTMLElement).innerText.trim());
        const rows = Array.from(t.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td as HTMLElement).innerText.trim()));
        const decimalsPerCol = heads.map((_, i) => {
          const set = new Set<number>();
          rows.forEach((r) => {
            const v = r[i] ?? '';
            if (/%/.test(v)) { const m = /,(\d+)/.exec(v); set.add(m ? m[1]!.length : 0); }
          });
          return Array.from(set).sort();
        });
        return { heads, rows, decimalsPerCol };
      });
    });
    out.oeeChartLines = await page.evaluate(() => {
      const paths = Array.from(document.querySelectorAll('svg path[stroke]')).filter((p) => {
        const d = p.getAttribute('d') ?? '';
        return d.length > 60;
      });
      return paths.slice(0, 8).map((p) => {
        const cs = getComputedStyle(p);
        return { stroke: cs.stroke, dash: cs.strokeDasharray, width: cs.strokeWidth, name: p.getAttribute('name') ?? p.className?.toString?.() ?? '' };
      });
    });

    for (const [key, route] of [['done', DONE_ORDER], ['open', OPEN_ORDER]] as const) {
      await openRoute(page, { base, route, as: 'admin' });
      out[`anim_${key}`] = await page.evaluate(() => {
        const hit: Array<{ tag: string; cls: string; name: string; dur: string }> = [];
        document.querySelectorAll('main *').forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.animationName && cs.animationName !== 'none') {
            hit.push({ tag: el.tagName, cls: (el.className?.toString?.() ?? '').slice(0, 90), name: cs.animationName, dur: cs.animationDuration });
          }
        });
        const status = (document.querySelector('main [data-slot="badge"]') as HTMLElement | null)?.innerText ?? '';
        const timeline = Array.from(document.querySelectorAll('main ol li, main ul li')).map((l) => (l as HTMLElement).innerText.split('\n')[0]).slice(0, 8);
        return { status, timeline, animated: hit };
      });
    }

    // transition taraması
    const scan: Record<string, unknown> = {};
    for (const route of ROUTES) {
      await openRoute(page, { base, route, as: 'admin' });
      scan[route] = await page.evaluate(() => {
        const bad: Array<{ cls: string; prop: string; dur: string; ease: string }> = [];
        document.querySelectorAll('*').forEach((el) => {
          const cs = getComputedStyle(el);
          const prop = cs.transitionProperty;
          const durs = cs.transitionDuration.split(',').map((d) => parseFloat(d) * 1000);
          const ease = cs.transitionTimingFunction;
          const maxDur = durs.length ? Math.max(...durs) : 0;
          const isAll = prop === 'all' || prop.split(',').map((s) => s.trim()).includes('all');
          const isSlow = maxDur >= 300;
          const isEaseIn = /ease-in(?!-out)|cubic-bezier\(0\.42,\s*0,\s*1,\s*1\)/.test(ease);
          if ((isAll || isSlow || isEaseIn) && cs.transitionDuration !== '0s') {
            bad.push({ cls: (el.className?.toString?.() ?? el.tagName).slice(0, 80), prop, dur: cs.transitionDuration, ease });
          }
        });
        return bad.slice(0, 10);
      });
    }
    out.transitionScan = scan;
    await ctx.close();
  }

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
