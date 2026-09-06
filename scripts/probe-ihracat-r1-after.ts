/**
 * İhracat modülü Tur 1 düzeltme kanıtı (measureAfter) — probe-ihracat-r1.ts ile AYNI yöntem,
 * güncel sevkiyat id'si ve DataTable'a geçen ekranlara uyarlanmış.
 *   pnpm tsx scripts/probe-ihracat-r1-after.ts <shipmentId>
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const SHIPMENT = process.argv[2];
if (!SHIPMENT) throw new Error('Kullanım: probe-ihracat-r1-after.ts <shipmentId>');
const base = defaultBaseUrl();
const outDir = resolve(process.cwd(), 'artifacts', 'screens', 'ihracat-probe-r1-after');
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
    const heads = Array.from(t.querySelectorAll('thead th')).map((th) => ({ text: (th.textContent || '').trim().slice(0, 24), w: Math.round(th.getBoundingClientRect().width), transform: getComputedStyle(th).textTransform, fs: getComputedStyle(th).fontSize }));
    const rows = Array.from(t.querySelectorAll('tbody tr'));
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

const cardProbe = () =>
  Array.from(document.querySelectorAll('main ul.space-y-2 > li')).map((li) => {
    const rect = li.getBoundingClientRect();
    return { h: Math.round(rect.height), text: (li.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) };
  });

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  try {
    // 1. sevkiyat listesi — DataTable iç scrollWidth/clientWidth (masaüstü) + mobil kart metrik yuvası
    out.listDesk = await withPage(browser, '/ihracat/sevkiyatlar', DESK, async (p) => {
      const el = await p.evaluate(() => {
        const t = document.querySelector('table');
        const sc = t?.closest('.contain-paint > div') as HTMLElement | null;
        return sc ? { sw: sc.scrollWidth, cw: sc.clientWidth } : null;
      });
      return el;
    });
    out.listMob = await withPage(browser, '/ihracat/sevkiyatlar', MOB, (p) => p.evaluate(cardProbe));

    // 2. kurlar: artık DataTable — sekme yok, tablo probu + mobil kart + pagination varlığı
    out.kurlarDesk = await withPage(browser, '/ihracat/kurlar', DESK, async (p) => {
      const t = await p.evaluate(tableProbe);
      const pagination = await p.locator('text=/Sayfa \\d+\\s*\\/\\s*\\d+/').count().catch(() => 0);
      const legend = await p.evaluate(() => Array.from(document.querySelectorAll('.recharts-legend-item-text')).map((e) => e.textContent));
      return { t, pagination, legend };
    });
    out.kurlarMob = await withPage(browser, '/ihracat/kurlar', MOB, async (p) => {
      const t = await p.evaluate(tableProbe);
      const cards = await p.evaluate(cardProbe);
      return { t, cards };
    });

    // 3. gtip: iki tablo başlık stili + select kutu sayısı + çerçeve rengi (durağan)
    out.gtipDesk = await withPage(browser, '/ihracat/gtip', DESK, async (p) => {
      const t = await p.evaluate(tableProbe);
      const sel = await p.evaluate(() =>
        Array.from(document.querySelectorAll('[data-slot="select-trigger"]')).map((e) => {
          const cs = getComputedStyle(e);
          const r = e.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), border: cs.borderColor, bw: cs.borderWidth };
        }),
      );
      return { t, selectCount: sel.length, sel: sel.slice(0, 3) };
    });
    out.gtipMob = await withPage(browser, '/ihracat/gtip', MOB, (p) =>
      p.evaluate(() =>
        Array.from(document.querySelectorAll('[data-slot="select-trigger"]')).map((e) => {
          const r = e.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        }),
      ),
    );

    // 4. belgeler tablosu boş sütunlar (varsayılan görünürlük)
    out.belgelerDesk = await withPage(browser, '/ihracat/belgeler', DESK, (p) => p.evaluate(tableProbe));
    out.belgelerMob = await withPage(browser, '/ihracat/belgeler', MOB, (p) => p.evaluate(cardProbe));

    // 5. detay sekmeleri
    for (const [vpName, vp] of [['desktop', DESK], ['mobile', MOB]] as const) {
      out[`tabs_${vpName}`] = await withPage(browser, `/ihracat/sevkiyatlar/${SHIPMENT}`, vp as Vp, async (p) => {
        const res: Record<string, unknown> = {};
        for (const tab of ['Sipariş satırları', 'Çeki listesi', 'Belgeler', 'Fatura & kur']) {
          await p.getByRole('tab', { name: tab }).click();
          await p.waitForTimeout(400);
          const slug = tab.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') || 'tab';
          await p.screenshot({ path: `${outDir}/${vpName}-${slug}.png`, fullPage: true, animations: 'disabled' });
          res[tab] = await p.evaluate(tableProbe);
        }
        return res;
      });
    }

    // 6. ağırlık/kur biçimlendirme (Proforma & gümrük paneli + Fatura & kur sekmesi)
    out.weightsAndRate = await withPage(browser, `/ihracat/sevkiyatlar/${SHIPMENT}`, DESK, async (p) => {
      const netgross = await p.evaluate(() => {
        const el = Array.from(document.querySelectorAll('div')).find((d) => d.textContent?.trim() === 'Net / brüt ağırlık');
        const valueEl = el?.nextElementSibling as HTMLElement | null;
        const spans = Array.from(valueEl?.querySelectorAll('span') ?? []) as HTMLElement[];
        return { text: valueEl?.textContent?.trim(), spanColors: spans.map((s) => ({ text: s.textContent, color: getComputedStyle(s).color })) };
      });
      await p.getByRole('tab', { name: 'Fatura & kur' }).click();
      await p.waitForTimeout(300);
      const rate = await p.evaluate(() => {
        const el = Array.from(document.querySelectorAll('div')).find((d) => d.textContent?.trim() === 'Kur (TCMB)');
        const valueEl = el?.nextElementSibling as HTMLElement | null;
        return valueEl?.textContent?.trim();
      });
      return { netgross, rate };
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
