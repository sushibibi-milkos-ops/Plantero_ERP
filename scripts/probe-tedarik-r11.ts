import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const PO = '8c8ef372-f51e-4499-9a61-b589ac36af47';
const ROUTES: Array<[string, string]> = [
  ['kritik-stok', '/satin-alma/kritik-stok'],
  ['onay-kuyrugu', '/satin-alma/onay-kuyrugu'],
  ['siparisler', '/satin-alma/siparisler'],
  ['po-detay', `/satin-alma/siparisler/${PO}`],
  ['yeni', '/satin-alma/siparisler/yeni'],
  ['tedarikciler', '/satin-alma/tedarikciler'],
];

async function main() {
  const browser = await launchBrowser();
  const out: any = {};
  for (const [k, route] of ROUTES) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await c.newPage();
    await openRoute(p, { base, route, as: 'admin' });
    await p.waitForTimeout(800);

    // 1) klavye durakları + odak halkası
    const stops: any[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 45; i++) {
      await p.keyboard.press('Tab');
      await p.waitForTimeout(160);
      const info = await p.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || a === document.body) return null;
        if (!a.closest('main')) return null;
        const cs = getComputedStyle(a);
        return { tag: a.tagName.toLowerCase(), txt: (a.textContent || '').trim().slice(0, 28), aria: a.getAttribute('aria-label') || '', outline: cs.outlineWidth + ' ' + cs.outlineStyle, ring: cs.boxShadow.slice(0, 60) };
      });
      if (info) { const key = info.tag + '|' + info.txt + '|' + info.aria; if (!seen.has(key)) { seen.add(key); stops.push(info); } }
    }

    // 2) kırpılan metin (ellipsis), tabular-nums, satır hover, başlık boyutları
    const dom = await p.evaluate(() => {
      const clipped: any[] = [];
      document.querySelectorAll('main *').forEach((el) => {
        const e = el as HTMLElement;
        if (e.children.length > 0) return;
        const t = (e.textContent || '').trim();
        if (!t) return;
        if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0) {
          const cs = getComputedStyle(e);
          if (cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden') clipped.push({ txt: t.slice(0, 40), sw: e.scrollWidth, cw: e.clientWidth, cls: e.className.toString().slice(0, 60) });
        }
      });
      const nums: any = {};
      document.querySelectorAll('main .num, main [class*="tabular"], main td, main th').forEach((el) => {
        const cs = getComputedStyle(el as HTMLElement);
        const v = cs.fontVariantNumeric;
        nums[v] = (nums[v] || 0) + 1;
      });
      const th = Array.from(document.querySelectorAll('main thead th')).map((e) => {
        const r = (e as HTMLElement).getBoundingClientRect();
        return { txt: (e.textContent || '').trim().slice(0, 24), w: Math.round(r.width) };
      });
      const skel = document.querySelectorAll('[data-slot="skeleton"], .animate-pulse').length;
      const h = document.querySelector('main h1') as HTMLElement | null;
      return { clipped, nums, th, skel, h1: h ? { size: getComputedStyle(h).fontSize, weight: getComputedStyle(h).fontWeight, ls: getComputedStyle(h).letterSpacing } : null };
    });

    // 3) satır hover geri bildirimi
    let hover: any = null;
    const row = p.locator('main tbody tr').first();
    if (await row.count()) {
      const before = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
      await row.hover();
      await p.waitForTimeout(200);
      const after = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
      hover = { before, after, changed: before !== after };
    }

    out[k] = { stops, ...dom, hover };
    await c.close();
    console.error('ok ' + k + ' stops=' + stops.length + ' clipped=' + dom.clipped.length);
  }
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r11.json', JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
