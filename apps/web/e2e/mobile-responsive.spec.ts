import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './fixtures/auth';

/**
 * Telefon duyarlılığı (docs/MOBILE-AUDIT.md): 390x844'te temsilî rotalarda
 *  - belge yatay taşması yok (documentElement.scrollWidth <= clientWidth),
 *  - 44x44 altı etkileşimli hedef yok,
 *  - mobilde form alanları 16px+ (iOS Safari odakta yakınlaştırmaz),
 *  - sayfanın son öğesi alt sekme çubuğunun altında kalmıyor.
 * Dinamik (id'li) rotalar liste sayfasındaki ilk satırdan tıklanarak açılır — seed kimliğine bağlı değil.
 */

const VIEWPORT = { width: 390, height: 844 };

/** Sayfa "oturana" dek bekle: iskeletler gider, giriş animasyonları biter. */
async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page
    .waitForFunction(() => document.querySelectorAll('[aria-busy], [data-slot="skeleton"], .animate-pulse').length === 0, null, { timeout: 45_000 })
    .catch(() => {});
  await page.waitForTimeout(500);
}

type Probe = {
  scrollWidth: number;
  clientWidth: number;
  overflowers: string[];
  small: Array<{ selector: string; w: number; h: number }>;
  inputsBelow16: string[];
  covered: number;
};

/** Tarayıcıda ölç — scripts/mobile-audit.ts ile aynı kurallar (sade sürüm). */
async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const name = (el: Element) => {
      const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
      return `${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''}${t ? ` "${t}"` : ''}`;
    };
    const doc = document.documentElement;
    const cw = doc.clientWidth;
    const scrollWidth = Math.max(doc.scrollWidth, document.body.scrollWidth);

    const overflowers: string[] = [];
    if (scrollWidth > cw) {
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        if (visible(el) && el.getBoundingClientRect().right > cw + 1) overflowers.push(name(el));
        if (overflowers.length >= 6) break;
      }
    }

    const interactive = document.querySelectorAll(
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="option"], [role="combobox"]',
    );
    const small: Array<{ selector: string; w: number; h: number }> = [];
    for (const el of Array.from(interactive)) {
      if (!visible(el) || el.closest('[aria-hidden="true"]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) small.push({ selector: name(el), w: Math.round(r.width), h: Math.round(r.height) });
    }

    const inputsBelow16: string[] = [];
    for (const el of Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select'))) {
      if (visible(el) && !el.closest('[aria-hidden="true"]') && parseFloat(getComputedStyle(el).fontSize) < 16) inputsBelow16.push(name(el));
    }

    // Belgenin en altına kaydır: gövdenin son görünür yaprağı alt sekme çubuğunun üstünde mi?
    let covered = 0;
    const nav = document.querySelector('nav[aria-label="Hızlı erişim"]');
    const main = document.querySelector('main');
    if (nav && main && visible(nav)) {
      window.scrollTo(0, doc.scrollHeight);
      let lowest = 0;
      for (const el of Array.from(main.querySelectorAll('*'))) {
        if (el.children.length > 0 || !visible(el) || el.closest('details:not([open])')) continue;
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) lowest = Math.max(lowest, r.bottom);
      }
      covered = Math.max(0, Math.round(lowest - nav.getBoundingClientRect().top));
      window.scrollTo(0, 0);
    }
    return { scrollWidth, clientWidth: cw, overflowers, small, inputsBelow16, covered };
  });
}

/** Liste sayfasındaki (mobil kart görünümü) ilk satıra dokunup ayrıntı rotasının yolunu döndürür. */
async function openFirstDetail(page: Page, listRoute: string, pattern: RegExp): Promise<string> {
  await page.goto(listRoute);
  await settle(page);
  const firstRow = page.locator('main ul > li').first();
  await expect(firstRow).toBeVisible();
  await firstRow.click({ position: { x: 24, y: 12 } });
  await page.waitForURL((u) => pattern.test(u.pathname), { timeout: 60_000 });
  return new URL(page.url()).pathname;
}

const LIST_ROUTES = [
  '/kokpit',
  '/onaylar',
  '/ana-veri/urunler',
  '/ana-veri/cariler',
  '/satis/teklifler',
  '/satis/siparisler',
  '/satis/siparisler/yeni',
  '/satin-alma/siparisler',
  '/depo/stok',
  '/depo/lotlar',
  '/depo/mal-kabul',
  '/uretim/is-emirleri',
  '/kalite/kontroller',
  '/kalite/izlenebilirlik',
  '/muhasebe/faturalar',
  '/muhasebe/faturalar/yeni',
  '/finans/nakit-akisi',
  '/bakim/makineler',
  '/ayarlar/kullanicilar',
];

test.describe('Telefon (390x844) duyarlılığı', () => {
  test.describe.configure({ timeout: 900_000 });

  test('temsilî rotalarda yatay taşma, küçük hedef ve alt çubuk örtmesi yok', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.setDefaultNavigationTimeout(120_000);
    await loginAs(page, 'admin');

    const failures: string[] = [];
    const routes = [...LIST_ROUTES];

    // Dinamik rotalar: liste → ilk kaydın bağlantısı
    const detailSeeds: Array<[string, RegExp]> = [
      ['/satis/siparisler', /^\/satis\/siparisler\/[0-9a-f-]{36}$/],
      ['/muhasebe/faturalar', /^\/muhasebe\/faturalar\/[0-9a-f-]{36}$/],
      ['/ana-veri/urunler', /^\/ana-veri\/urunler\/[0-9a-f-]{36}$/],
    ];
    for (const [list, pattern] of detailSeeds) {
      routes.push(await openFirstDetail(page, list, pattern));
    }

    for (const route of routes) {
      await page.goto(route);
      await settle(page);
      const p = await probe(page);
      if (p.scrollWidth > p.clientWidth) failures.push(`${route}: yatay taşma ${p.scrollWidth}>${p.clientWidth} (${p.overflowers.join(' | ')})`);
      if (p.small.length) failures.push(`${route}: 44px altı hedef ${p.small.length} adet (${p.small.slice(0, 4).map((s) => `${s.selector} ${s.w}x${s.h}`).join(' | ')})`);
      if (p.inputsBelow16.length) failures.push(`${route}: 16px altı form alanı (${p.inputsBelow16.slice(0, 3).join(' | ')})`);
      if (p.covered > 0) failures.push(`${route}: son içerik alt sekme çubuğunun ${p.covered}px altında`);
    }

    expect(routes.length).toBeGreaterThanOrEqual(15);
    expect(failures, failures.join('\n')).toEqual([]);
    await ctx.close().catch(() => {}); // eşzamanlı başka bir koşu test-results izlerini silebilir
  });

  test('alt sekme çubuğu: güvenli alan dolgusu ve gövde alt boşluğu', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await loginAs(page, 'admin', '/ana-veri/urunler');
    await settle(page);
    const info = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Hızlı erişim"]') as HTMLElement | null;
      const main = document.querySelector('main') as HTMLElement | null;
      return {
        navH: nav ? nav.getBoundingClientRect().height : 0,
        mainPb: main ? parseFloat(getComputedStyle(main).paddingBottom) : 0,
        viewportFit: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
      };
    });
    // Gövde alt dolgusu en az sekme çubuğu yüksekliği kadar olmalı (sticky eylem şeridi payı dahil)
    expect(info.mainPb).toBeGreaterThanOrEqual(info.navH);
    expect(info.viewportFit).toContain('viewport-fit=cover');
    await ctx.close().catch(() => {}); // eşzamanlı başka bir koşu test-results izlerini silebilir
  });

  test('menü sheet ve komut paleti 390px içine sığar', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await loginAs(page, 'admin', '/kokpit');
    await settle(page);
    await page.getByRole('navigation', { name: 'Hızlı erişim' }).getByRole('button', { name: 'Menü' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(700); // sheet giriş animasyonu (350ms) bitsin — dev sunucuda yavaş çizimde de
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(VIEWPORT.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(VIEWPORT.height + 1);
    await ctx.close().catch(() => {}); // eşzamanlı başka bir koşu test-results izlerini silebilir
  });
});
