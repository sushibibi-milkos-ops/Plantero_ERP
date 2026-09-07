/** Tur 16 kritik ölçümü: sol-alt siyah daire artefaktı, KPI şeridi @390, OEE ondalıkları, zaman çizgisi nabzı, boş durum, kod düzeyi CSS taraması. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const MK = '2bda065e-589b-4564-842e-40b9aa2dd77f'; // MK-001
const MO_DONE = 'ad414d0e-1025-43e7-9dfe-59b787e896af'; // MO-2026-000001 done
const MO_REPORTED = '1bd885a6-a893-4c7e-80e0-fa93040fca4c'; // MO-2026-000006 reported

const ROUTES: Array<[string, string]> = [
  ['makineler', '/bakim/makineler'],
  ['planlar', '/bakim/planlar'],
  ['isemirleri', '/bakim/is-emirleri'],
  ['isemirleriDetay', `/bakim/is-emirleri/${MO_DONE}`],
  ['isemirleriReported', `/bakim/is-emirleri/${MO_REPORTED}`],
  ['isemirleriYeni', '/bakim/is-emirleri/yeni'],
  ['makinelerDetay', `/bakim/makineler/${MK}`],
  ['oee', '/bakim/oee'],
];

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 1) Masaüstü: sol-alt daire artefaktı + CSS ihlalleri + tablo ölçümleri
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    for (const [key, route] of ROUTES) {
      await openRoute(page, { base, route, as: 'admin' });
      out[`d_${key}`] = await page.evaluate(() => {
        const vh = innerHeight;
        // sol-alt bölgede (x<120, y>vh-140) görünür, dairesel, koyu zeminli elemanlar
        const suspects = Array.from(document.querySelectorAll<HTMLElement>('body *'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 24 || r.height < 24 || r.width > 120 || r.height > 120) return false;
            if (r.left > 140 || r.bottom < vh - 160) return false;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
            const rad = parseFloat(cs.borderRadius);
            return rad >= Math.min(r.width, r.height) / 2 - 2 || cs.borderRadius.includes('%');
          })
          .map((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return {
              tag: el.tagName.toLowerCase(),
              cls: String(el.className ?? '').slice(0, 120),
              id: el.id,
              text: (el.textContent ?? '').trim().slice(0, 40),
              rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
              bg: cs.backgroundColor,
              bgImage: cs.backgroundImage.slice(0, 60),
              zIndex: cs.zIndex,
              position: cs.position,
            };
          });
        // CSS ihlalleri: süresi > 0 olan transition-property:all, >=300ms, ease-in, scale(0)
        const viol: Array<Record<string, string>> = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('main *, nav *, header *'))) {
          const cs = getComputedStyle(el);
          const props = cs.transitionProperty.split(',').map((s) => s.trim());
          const durs = cs.transitionDuration.split(',').map((s) => parseFloat(s) * (s.includes('ms') ? 0.001 : 1));
          props.forEach((p, i) => {
            const d = durs[i] ?? durs[0] ?? 0;
            if (d > 0 && p === 'all') viol.push({ kind: 'transition-all', cls: String(el.className).slice(0, 80) });
          });
          const maxD = Math.max(0, ...durs);
          if (maxD >= 0.3) viol.push({ kind: `duration-${maxD}s`, cls: String(el.className).slice(0, 80) });
          if (cs.transitionTimingFunction.includes('cubic-bezier(0.42, 0, 1, 1)')) viol.push({ kind: 'ease-in', cls: String(el.className).slice(0, 80) });
          const ad = cs.animationDuration.split(',').map((s) => parseFloat(s) * (s.includes('ms') ? 0.001 : 1));
          if (cs.animationName !== 'none' && Math.max(0, ...ad) >= 0.3) viol.push({ kind: `anim-${cs.animationName}-${cs.animationDuration}`, cls: String(el.className).slice(0, 80) });
        }
        const tbl = document.querySelector('tbody');
        const rows = tbl ? Array.from(tbl.querySelectorAll('tr')) : [];
        return {
          suspects,
          violations: viol.slice(0, 20),
          violationCount: viol.length,
          rowCount: rows.length,
          rowHeights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height * 10) / 10))].sort((a, b) => a - b),
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
    }
    await ctx.close();
  }

  // 2) Mobil 390: KPI şeridi, taşma, dokunma hedefleri, daire artefaktı
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    for (const [key, route] of ROUTES) {
      await openRoute(page, { base, route, as: 'admin' });
      out[`m_${key}`] = await page.evaluate(() => {
        const strip = Array.from(document.querySelectorAll<HTMLElement>('div,ul')).find(
          (d) => d.scrollWidth > d.clientWidth + 4 && d.clientWidth > 200 && d.children.length >= 3 && d.getBoundingClientRect().top < 500,
        );
        const kpi = strip
          ? {
              scrollWidth: strip.scrollWidth,
              clientWidth: strip.clientWidth,
              cards: strip.children.length,
              fullyVisible: Array.from(strip.children).filter((c) => c.getBoundingClientRect().right <= strip.getBoundingClientRect().right + 1).length,
            }
          : null;
        const small = Array.from(document.querySelectorAll<HTMLElement>('a,button,input,select,[role="button"],[role="tab"],[role="menuitem"]'))
          .filter((el) => {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
          })
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { tag: el.tagName.toLowerCase(), cls: String(el.className ?? '').slice(0, 70), text: (el.textContent ?? '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height), aria: el.getAttribute('aria-hidden') };
          });
        return {
          kpi,
          small,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
    }
    await ctx.close();
  }

  // 3) OEE ondalık dağılımı + zaman çizgisi nabzı + boş durumlar
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: '/bakim/oee', as: 'admin' });
    out.oeeDecimals = await page.evaluate(() => {
      const tbl = Array.from(document.querySelectorAll('table')).find((t) => t.textContent?.includes('HAT1'));
      if (!tbl) return null;
      const heads = Array.from(tbl.querySelectorAll('thead th')).map((h) => (h.textContent ?? '').trim());
      const rows = Array.from(tbl.querySelectorAll('tbody tr'));
      const res: Record<string, { values: string[]; decimals: number[] }> = {};
      heads.forEach((h, i) => {
        const vals = rows.map((r) => (r.children[i]?.textContent ?? '').trim()).filter((v) => v.includes('%'));
        if (!vals.length) return;
        res[h] = { values: vals, decimals: [...new Set(vals.map((v) => (v.split(',')[1] ?? '').replace('%', '').trim().length))] };
      });
      return res;
    });
    for (const [key, id] of [['done', MO_DONE], ['reported', MO_REPORTED]] as const) {
      await openRoute(page, { base, route: `/bakim/is-emirleri/${id}`, as: 'admin' });
      out[`anim_${key}`] = await page.evaluate(() =>
        Array.from(document.querySelectorAll('main *'))
          .filter((el) => getComputedStyle(el).animationName !== 'none')
          .map((el) => ({ cls: String(el.className ?? '').slice(0, 90), anim: getComputedStyle(el).animationName, dur: getComputedStyle(el).animationDuration })),
      );
    }
    for (const [key, route] of [['makineler', '/bakim/makineler?q=zzzyokk'], ['planlar', '/bakim/planlar?q=zzzyokk'], ['isemirleri', '/bakim/is-emirleri?q=zzzyokk']] as const) {
      await openRoute(page, { base, route, as: 'admin' });
      out[`empty_${key}`] = await page.evaluate(() => ({
        rows: document.querySelectorAll('tbody tr').length,
        text: (document.querySelector('main')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 400),
      }));
    }
    await ctx.close();
  }

  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
