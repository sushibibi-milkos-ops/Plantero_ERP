/** Tur 16: boş durum, odak halkası, kapalı sevkiyat Fatura&kur dokunma hedefi. */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
const DB = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
const id = (no: string) => execSync(`psql "${DB}" -t -A -c "select id from export_shipments where doc_no='${no}';"`, { encoding: 'utf8' }).trim();

async function main() {
  const browser = await launchBrowser();
  const res: any = { empty: {}, focus: {}, closedFaturaTouch: [] };

  // 1) boş durum: arama kutusuna eşleşmeyen metin
  for (const [k, route] of [['sevkiyatlar', '/ihracat/sevkiyatlar'], ['belgeler', '/ihracat/belgeler'], ['kurlar', '/ihracat/kurlar'], ['gtip', '/ihracat/gtip']] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route, as: 'admin' });
    await p.locator('input[aria-label="Tabloda ara"]').fill('zzzqqq-yok');
    await p.waitForTimeout(500);
    res.empty[k] = await p.evaluate(() => {
      const main = document.querySelector('main') as HTMLElement;
      const rows = main.querySelectorAll('table tbody tr').length;
      const txt = (main.innerText || '').split('\n').filter(Boolean).slice(-6);
      const svgCount = Array.from(main.querySelectorAll('svg')).filter((s) => s.getBoundingClientRect().top > 300).length;
      return { rows, tailText: txt, svgBelow300: svgCount };
    });
    await ctx.close();
  }

  // 2) odak halkası: gerçek Tab
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route: `/ihracat/sevkiyatlar/${id('EXP-2026-000002')}`, as: 'admin' });
    const out: any[] = [];
    for (let i = 0; i < 14; i++) {
      await p.keyboard.press('Tab');
      await p.waitForTimeout(120);
      out.push(await p.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 28), visible: el.matches(':focus-visible'), outline: cs.outlineWidth + ' ' + cs.outlineStyle, ring: cs.boxShadow.slice(0, 60), border: cs.borderColor };
      }));
    }
    res.focus = out;
    await ctx.close();
  }

  // 3) kapalı sevkiyat Fatura & kur sekmesi: dokunma hedefleri 390px
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route: `/ihracat/sevkiyatlar/${id('EXP-2026-000001')}`, as: 'admin' });
    await p.getByRole('tab', { name: 'Fatura & kur' }).first().click();
    await p.waitForTimeout(600);
    res.closedFaturaTouch = await p.evaluate(() => {
      const main = document.querySelector('main') as HTMLElement;
      return Array.from(main.querySelectorAll('a,button,input,[role="tab"]')).map((e) => { const r = e.getBoundingClientRect(); return { sel: e.tagName + ':' + (e.getAttribute('href') ?? e.textContent ?? '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }).filter((x) => x.w > 0 && (x.w < 44 || x.h < 44));
    });
    await ctx.close();
  }

  writeFileSync('artifacts/critic/probe-ihracat-r16b.json', JSON.stringify(res, null, 2));
  await browser.close();
  console.error('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
