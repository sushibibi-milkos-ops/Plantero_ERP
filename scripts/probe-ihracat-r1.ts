/**
 * İhracat modülü Tur 1 kritik ölçümü: iç tablo taşması, sütun genişlikleri,
 * sekme içeriği ekran görüntüleri, boş sütun oranı.
 *   pnpm tsx scripts/probe-ihracat-r1.ts
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const SHIPMENT = 'f6379b30-7400-4cec-bbaf-b51e9ac74c87';
const base = defaultBaseUrl();
const outDir = resolve(process.cwd(), 'artifacts', 'screens', 'ihracat-probe-r1');
mkdirSync(outDir, { recursive: true });

type Vp = { width: number; height: number; mobile: boolean };
const DESK: Vp = { width: 1440, height: 900, mobile: false };
const MOB: Vp = { width: 390, height: 844, mobile: true };

async function withPage<T>(browser: Awaited<ReturnType<typeof launchBrowser>>, route: string, vp: Vp, fn: (page: import('@playwright/test').Page) => Promise<T>): Promise<T> {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: vp.mobile, hasTouch: vp.mobile, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route, as: 'admin', dark: false });
  const r = await fn(page);
  await ctx.close();
  return r;
}

const tableProbe = () =>
  Array.from(document.querySelectorAll('table')).map((t) => {
    const sc = t.parentElement as HTMLElement;
    const heads = Array.from(t.querySelectorAll('thead th')).map((th) => ({ text: (th.textContent || '').trim().slice(0, 20), w: Math.round(th.getBoundingClientRect().width), transform: getComputedStyle(th).textTransform, fs: getComputedStyle(th).fontSize }));
    const rows = Array.from(t.querySelectorAll('tbody tr'));
    // sütun bazında "—" oranı
    const dash = heads.map((_, i) => rows.filter((r) => ((r.children[i]?.textContent || '').trim() === '—')).length);
    return {
      tableW: Math.round(t.getBoundingClientRect().width),
      scrollW: sc?.scrollWidth ?? 0,
      clientW: sc?.clientWidth ?? 0,
      clipped: (sc?.scrollWidth ?? 0) - (sc?.clientWidth ?? 0),
      rows: rows.length,
      heads,
      dashCounts: dash,
    };
  });

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  try {
    // 1. sevkiyat listesi - DataTable sütun genişlikleri (desktop)
    out.listDesk = await withPage(browser, '/ihracat/sevkiyatlar', DESK, async (p) => {
      const t = await p.evaluate(tableProbe);
      const cardW = await p.evaluate(() => {
        const el = document.querySelector('table')?.closest('div');
        return el ? { sw: el.scrollWidth, cw: el.clientWidth } : null;
      });
      return { t, cardW };
    });

    // 2. kurlar tablosu desktop + mobil taşma
    out.kurlarDesk = await withPage(browser, '/ihracat/kurlar', DESK, (p) => p.evaluate(tableProbe));
    out.kurlarMob = await withPage(browser, '/ihracat/kurlar', MOB, (p) => p.evaluate(tableProbe));

    // 3. gtip: iki tablo başlık stili + select kutu sayısı
    out.gtipDesk = await withPage(browser, '/ihracat/gtip', DESK, async (p) => {
      const t = await p.evaluate(tableProbe);
      const sel = await p.evaluate(() =>
        Array.from(document.querySelectorAll('[data-slot="select-trigger"]')).map((e) => {
          const cs = getComputedStyle(e);
          const r = e.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), border: cs.borderColor, bw: cs.borderWidth };
        }),
      );
      return { t, selectCount: sel.length, sel: sel.slice(0, 2) };
    });

    // 4. belgeler tablosu boş sütunlar
    out.belgelerDesk = await withPage(browser, '/ihracat/belgeler', DESK, (p) => p.evaluate(tableProbe));

    // 5. detay sekmeleri: ekran görüntüsü + tablo ölçümü
    for (const [vpName, vp] of [['desktop', DESK], ['mobile', MOB]] as const) {
      out[`tabs_${vpName}`] = await withPage(browser, `/ihracat/sevkiyatlar/${SHIPMENT}`, vp as Vp, async (p) => {
        const res: Record<string, unknown> = {};
        for (const tab of ['Çeki listesi', 'Belgeler', 'Fatura & kur']) {
          await p.getByRole('tab', { name: tab }).click();
          await p.waitForTimeout(400);
          const slug = tab.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') || 'tab';
          await p.screenshot({ path: `${outDir}/${vpName}-${slug}.png`, fullPage: true, animations: 'disabled' });
          res[tab] = await p.evaluate(tableProbe);
        }
        return res;
      });
    }

    // 6. odak halkası: sekme + satır aksiyonu (desktop)
    out.focus = await withPage(browser, '/ihracat/sevkiyatlar', DESK, async (p) => {
      await p.keyboard.press('Tab');
      const info: Array<{ tag: string; label: string; outline: string; shadow: string }> = [];
      for (let i = 0; i < 24; i++) {
        info.push(
          await p.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el) return { tag: '-', label: '-', outline: '-', shadow: '-' };
            const cs = getComputedStyle(el);
            return { tag: el.tagName.toLowerCase(), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28), outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, shadow: cs.boxShadow.slice(0, 60) };
          }),
        );
        await p.keyboard.press('Tab');
      }
      return info;
    });
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(out, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
