/**
 * Tur 14 — bakim modülü kritik ölçümleri (yeniden doğrulama).
 * 1) /bakim/oee + /bakim/makineler @390: KpiStripRow scrollWidth/clientWidth (bakim-oee-04)
 * 2) /bakim/oee @1440: yüzde sütunlarında ondalık basamak kümesi (bakim-oee-05)
 * 3) /bakim/is-emirleri/<done> @1440: animasyonlu öğe sayısı (bakim-isemirleri-detay-14)
 * 4) /bakim/is-emirleri @390: mobil kart rozet sağ kenarları (shell aksiyon oluğu regresyon kontrolü)
 * 5) 7 rota @1440: hesaplanmış stilde transition-property:all / süre ≥300ms / ease-in taraması
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const DONE_ORDER = '/bakim/is-emirleri/d96f2887-9da4-47b5-9e5a-efebe3a3158d';
const OPEN_ORDER = '/bakim/is-emirleri/cb7b9e47-c88e-416f-9784-7ebad33ef5f9';
const MACHINE = '/bakim/makineler/8d445599-2fa3-4433-96a5-972be1a6f91e';

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

  // --- 390px
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    const page = await ctx.newPage();

    for (const [key, route] of [['oee', '/bakim/oee'], ['makineler', '/bakim/makineler']] as const) {
      await openRoute(page, { base, route, as: 'admin' });
      out[`kpiStrip_${key}_390`] = await page.evaluate(() => {
        const cands = Array.from(document.querySelectorAll('main div')).filter(
          (d) => d.scrollWidth > d.clientWidth + 4 && d.querySelectorAll('[class*="tabular-nums"], .num').length >= 2,
        );
        const strip = cands[0];
        if (!strip) return null;
        const cards = Array.from(strip.children) as HTMLElement[];
        const sr = strip.getBoundingClientRect();
        return {
          scrollWidth: strip.scrollWidth,
          clientWidth: strip.clientWidth,
          cards: cards.length,
          fullyVisible: cards.filter((c) => {
            const r = c.getBoundingClientRect();
            return r.left >= sr.left - 1 && r.right <= sr.right + 1;
          }).length,
        };
      });
    }

    await openRoute(page, { base, route: '/bakim/is-emirleri', as: 'admin' });
    out.isemirleriMobilKart = await page.evaluate(() => {
      const lis = Array.from(document.querySelectorAll('main ul > li'));
      return lis.map((li) => {
        const badge = li.querySelector('[data-slot="badge"], span[class*="rounded-full"][class*="px-"]');
        const btn = li.querySelector('button[aria-haspopup="menu"]');
        const bb = badge?.getBoundingClientRect();
        return {
          text: (li as HTMLElement).innerText.split('\n')[0],
          badgeRight: bb ? Math.round(bb.right) : null,
          hasMenu: Boolean(btn),
          h: Math.round((li as HTMLElement).getBoundingClientRect().height * 10) / 10,
        };
      });
    });
    await ctx.close();
  }

  // --- 1440px
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();

    await openRoute(page, { base, route: '/bakim/oee', as: 'admin' });
    out.oeeDecimals = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      return tables.map((t) => {
        const heads = Array.from(t.querySelectorAll('thead th')).map((th) => (th.textContent ?? '').trim());
        const rows = Array.from(t.querySelectorAll('tbody tr'));
        const perCol: Record<string, string[]> = {};
        rows.forEach((tr) => {
          Array.from(tr.querySelectorAll('td')).forEach((td, i) => {
            const txt = (td.textContent ?? '').trim();
            if (!txt.includes('%')) return;
            const m = /,(\d+)/.exec(txt);
            const key = heads[i] ?? `col${i}`;
            (perCol[key] ??= []).push(String(m ? m[1]!.length : 0));
          });
        });
        return {
          heads,
          decimalsPerCol: Object.fromEntries(Object.entries(perCol).map(([k, v]) => [k, Array.from(new Set(v)).sort()])),
          rowTexts: rows.map((r) => (r as HTMLElement).innerText.replace(/\s+/g, ' ')),
        };
      });
    });

    for (const [key, route] of [['done', DONE_ORDER], ['open', OPEN_ORDER]] as const) {
      await openRoute(page, { base, route, as: 'admin' });
      out[`anim_${key}`] = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('main *'));
        return els
          .filter((el) => {
            const cs = getComputedStyle(el);
            return cs.animationName !== 'none' && cs.animationName !== '';
          })
          .map((el) => ({
            tag: el.tagName,
            cls: (el.getAttribute('class') ?? '').slice(0, 120),
            name: getComputedStyle(el).animationName,
            dur: getComputedStyle(el).animationDuration,
          }));
      });
      out[`timeline_${key}`] = await page.evaluate(() => {
        const heads = Array.from(document.querySelectorAll('main *')).filter((e) =>
          /OLAY GEÇMİŞİ/i.test((e.textContent ?? '').slice(0, 40)),
        );
        const h = heads[heads.length - 1];
        const list = h?.parentElement?.querySelector('ol, ul');
        return list ? (list as HTMLElement).innerText.replace(/\n/g, ' | ') : null;
      });
    }

    // Kod düzeyi: hesaplanmış stil taraması
    const viol: Record<string, unknown> = {};
    for (const route of ROUTES) {
      await openRoute(page, { base, route, as: 'admin' });
      viol[route] = await page.evaluate(() => {
        const bad: Array<Record<string, string>> = [];
        Array.from(document.querySelectorAll('*')).forEach((el) => {
          const cs = getComputedStyle(el);
          const props = cs.transitionProperty;
          const durs = (cs.transitionDuration + ',' + cs.animationDuration)
            .split(',')
            .map((s) => parseFloat(s) * (s.includes('ms') ? 1 : 1000));
          const timing = cs.transitionTimingFunction + ' ' + cs.animationTimingFunction;
          const cls = (el.getAttribute('class') ?? '').slice(0, 80);
          if (props.split(',').some((p) => p.trim() === 'all')) bad.push({ kind: 'transition-all', cls });
          if (durs.some((d) => d >= 300)) bad.push({ kind: 'duration>=300', cls, d: String(Math.max(...durs)) });
          if (/\bease-in\b(?!-out)/.test(timing)) bad.push({ kind: 'ease-in', cls, timing });
        });
        return bad.slice(0, 20);
      });
    }
    out.styleViolations = viol;
    await ctx.close();
  }

  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
