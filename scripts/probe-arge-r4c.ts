import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const PID = '8f87f82e-8c96-4f2b-a23a-729b97e9b722';
const base = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  try {
    // 1) yükleme fazı: soğuk gezinme sırasında aria-busy / iskelet / panel yüksekliği örnekleri
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: `/arge/projeler/${PID}/board`, as: 'arge', base });
      const samples: unknown[] = [];
      const t0 = Date.now();
      const nav = page.click(`a[href="/arge/projeler/${PID}/receteler"]`).catch(() => {});
      for (let i = 0; i < 40; i++) {
        const s = await page.evaluate(() => {
          const busy = document.querySelectorAll('[aria-busy="true"],[aria-busy]').length;
          const sk = document.querySelectorAll('[data-slot="skeleton"],.animate-pulse').length;
          const spinner = document.querySelectorAll('.animate-spin').length;
          const panel = document.querySelector('main .rounded-xl');
          return { busy, sk, spinner, panelH: panel ? Math.round(panel.getBoundingClientRect().height) : null, docH: document.documentElement.scrollHeight };
        }).catch(() => null);
        samples.push({ t: Date.now() - t0, s });
        await page.waitForTimeout(60);
      }
      await nav;
      out.loadPhase = samples;
      await ctx.close();
    }
    // 2) 16px yazılar nerede
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR' });
      const page = await ctx.newPage();
      await openRoute(page, { route: `/arge/projeler/${PID}/receteler`, as: 'arge', base });
      out.bigFonts = await page.evaluate(() => {
        const res: unknown[] = [];
        for (const el of Array.from(document.querySelectorAll('main *'))) {
          const cs = getComputedStyle(el);
          const fs = parseFloat(cs.fontSize);
          if (fs < 14 || fs > 17) continue;
          const b = el.getBoundingClientRect();
          if (b.width < 4 || b.height < 4) continue;
          const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0);
          const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
          if (!hasText && !isInput) continue;
          res.push({ tag: el.tagName, fs, t: (isInput ? (el as HTMLInputElement).value : (el.textContent ?? '')).trim().slice(0, 24), cls: (el.className || '').toString().slice(0, 60) });
        }
        return res;
      });
      out.colors = await page.evaluate(() => {
        const set = new Map<string, number>();
        for (const el of Array.from(document.querySelectorAll('main *')).slice(0, 500)) {
          const cs = getComputedStyle(el);
          const b = el.getBoundingClientRect();
          if (b.width < 2 || b.height < 2) continue;
          for (const c of [cs.color, cs.backgroundColor]) {
            if (!c || c === 'rgba(0, 0, 0, 0)') continue;
            set.set(c, (set.get(c) ?? 0) + 1);
          }
        }
        return Array.from(set.entries()).sort((a, b) => b[1] - a[1]);
      });
      await ctx.close();
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify(out));
}
main().catch((e) => { console.error(e); process.exit(1); });
