/** Tur 14 kritik ölçümü (b) — arge/precete Fire etiketi görünürlüğü + odak halkası + boş durum. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = '9276cfa2-4a0e-42d9-9dd0-22d116cdcc0a';
const base = defaultBaseUrl();

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 390 — Fire etiketi görünür mü
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await openRoute(p, { base, route: `/arge/projeler/${PID}/receteler`, as: 'admin' });
    out.fireVisible = await p.evaluate(() => {
      const res: unknown[] = [];
      for (const el of [...document.querySelectorAll('*')]) {
        if (el.children.length !== 0) continue;
        const t = (el.textContent ?? '').trim();
        if (!/Fire/i.test(t) && t !== '%') continue;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        res.push({ t: t.slice(0, 20), display: cs.display, visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden', cls: (el.className ?? '').toString().slice(0, 60), w: Math.round(r.width), h: Math.round(r.height) });
      }
      return res;
    });
    out.fireInputCtx = await p.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')].filter((i) => /^\d{1,2}$/.test(i.value) && i.getBoundingClientRect().width < 90);
      return inputs.slice(0, 2).map((i) => {
        const row = i.closest('li, [data-slot="row"], div');
        return { value: i.value, aria: i.getAttribute('aria-label'), title: i.title, labelledby: i.getAttribute('aria-labelledby'), rowText: (row?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) };
      });
    });
    await ctx.close();
  }

  // 1440 — gerçek Tab odak halkası (tablo satırı) + boş durum
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await ctx.newPage();
    await openRoute(p, { base, route: '/arge/projeler', as: 'admin' });
    for (let i = 0; i < 30; i++) {
      await p.keyboard.press('Tab');
      const hit = await p.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a) return null;
        if (a.tagName !== 'TR' && !a.closest('tbody')) return null;
        const cs = getComputedStyle(a);
        return { tag: a.tagName, outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, boxShadow: cs.boxShadow.slice(0, 90), transition: cs.transition.slice(0, 90) };
      });
      if (hit) { out.rowFocus = hit; break; }
    }
    // boş durum
    await p.goto(`${base}/arge/projeler?q=zzzzyok`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(800);
    out.emptyProjeler = await p.evaluate(() => {
      const main = document.querySelector('main');
      return { text: (main?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 240), svgCount: main?.querySelectorAll('svg').length ?? 0, buttons: [...(main?.querySelectorAll('button') ?? [])].map((b) => (b.textContent ?? '').trim()).filter(Boolean).slice(0, 6) };
    });
    await p.goto(`${base}/arge/receteler?q=zzzzyok`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(800);
    out.emptyReceteler = await p.evaluate(() => {
      const main = document.querySelector('main');
      return { text: (main?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 240), svgCount: main?.querySelectorAll('svg').length ?? 0, buttons: [...(main?.querySelectorAll('button') ?? [])].map((b) => (b.textContent ?? '').trim()).filter(Boolean).slice(0, 6) };
    });
    await ctx.close();
  }

  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
}

run().catch((e) => { console.error(e); process.exit(1); });
