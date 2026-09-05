/**
 * Tur 1 — bildirimler modülü kritik ölçümleri (yalnızca okuma; hiçbir şeyi değiştirmez).
 *   tsx scripts/probe-bildirimler-r1.ts
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  try {
    // --- /onaylar masaüstü
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/onaylar', as: 'admin', base });
      out.onaylarDesktop = await page.evaluate(`(() => { const __name=(f)=>f; return (${(() => {
        const cards = Array.from(document.querySelectorAll('div.grid > div')) as HTMLElement[];
        const vh = window.innerHeight;
        const heights = cards.map((c) => Math.round(c.getBoundingClientRect().height));
        const fullyVisible = cards.filter((c) => c.getBoundingClientRect().bottom <= vh).length;
        // başlıkları kırpılan kartlar
        const titles = Array.from(document.querySelectorAll('div.grid > div .truncate')) as HTMLElement[];
        const truncated = titles.filter((t) => t.scrollWidth > t.clientWidth + 1).length;
        const titleTexts = titles.slice(0, 3).map((t) => t.textContent);
        // dolgulu birincil butonlar
        const btns = Array.from(document.querySelectorAll('button, a')) as HTMLElement[];
        const filled = btns.filter((b) => {
          const bg = getComputedStyle(b).backgroundColor;
          const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
          if (!m) return false;
          const [r, g, bl] = [Number(m[1]), Number(m[2]), Number(m[3])];
          return g > r + 25 && g > bl + 25; // yeşil dolgu
        });
        // güven rozetleri
        const badges = Array.from(document.querySelectorAll('div.grid > div span')).filter((s) => /^%\d+$/.test((s.textContent ?? '').trim())) as HTMLElement[];
        const badgeColors = badges.map((b) => ({ t: b.textContent?.trim(), c: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor }));
        // ingilizce ham enum sızıntısı
        const bodyText = document.querySelector('main')?.textContent ?? '';
        const leaks = ['unknown', 'expense', 'fee ', 'invoice'].filter((w) => bodyText.includes(w));
        const grid = document.querySelector('div.grid') as HTMLElement | null;
        return {
          cardCount: cards.length,
          cardHeights: [Math.min(...heights), heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)], Math.max(...heights)],
          fullyVisibleInFirstScreen: fullyVisible,
          truncatedTitles: truncated,
          titleSample: titleTexts,
          greenFilledButtons: filled.length,
          confidenceBadges: badgeColors.slice(0, 6),
          distinctBadgeStyles: new Set(badgeColors.map((b) => b.c + '|' + b.bg)).size,
          englishLeaks: leaks,
          gridCols: grid ? getComputedStyle(grid).gridTemplateColumns : null,
          pageScrollHeight: document.documentElement.scrollHeight,
        };
      }).toString()})(); })()`);
      // hover / seçim geri bildirimi
      const first = page.locator('div.grid > div').first();
      const before = await first.evaluate((e) => getComputedStyle(e).backgroundColor);
      await first.hover();
      await page.waitForTimeout(200);
      const after = await first.evaluate((e) => getComputedStyle(e).backgroundColor);
      out.cardHoverBg = { before, after, changed: before !== after };
      // J tuşuyla gezinme: seçim görünür alanda kalıyor mu?
      for (let i = 0; i < 8; i++) await page.keyboard.press('j');
      await page.waitForTimeout(250);
      out.keyboardNav = await page.evaluate(() => {
        const sel = document.querySelector('div.grid > div.border-primary\\/60, div.grid > div[class*="ring-primary"]') as HTMLElement | null;
        if (!sel) return { found: false };
        const r = sel.getBoundingClientRect();
        return { found: true, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, inViewport: r.top >= 0 && r.bottom <= window.innerHeight, scrollY: Math.round(window.scrollY) };
      });
      await ctx.close();
    }
    // --- /bildirimler (depo, dolu liste) masaüstü
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/bildirimler', as: 'depo', base });
      out.bildirimlerDesktop = await page.evaluate(`(() => { const __name=(f)=>f; return (${(() => {
        const items = Array.from(document.querySelectorAll('main ul > li')) as HTMLElement[];
        const bodies = Array.from(document.querySelectorAll('main ul > li p')) as HTMLElement[];
        const measure = bodies.map((p) => {
          const w = p.getBoundingClientRect().width;
          const fs = parseFloat(getComputedStyle(p).fontSize);
          // ortalama karakter genişliği ~0.5em
          return { widthPx: Math.round(w), fontSize: fs, approxCharsPerLine: Math.round(w / (fs * 0.5)) };
        });
        const titles = Array.from(document.querySelectorAll('main ul > li div.text-sm')) as HTMLElement[];
        return {
          itemCount: items.length,
          itemHeights: items.map((i) => Math.round(i.getBoundingClientRect().height)),
          bodyMeasure: measure,
          titleFontSizes: titles.map((t) => getComputedStyle(t).fontSize),
          hasTypeIcon: document.querySelectorAll('main ul > li svg').length,
          hasFilterTabs: document.querySelectorAll('main [role="tablist"], main [role="tab"]').length,
          listMaxWidth: getComputedStyle(document.querySelector('main ul') as Element).maxWidth,
          unreadRowBg: items.map((i) => getComputedStyle(i.firstElementChild as Element).backgroundColor),
        };
      }).toString()})(); })()`);
      await ctx.close();
    }
    // --- /onaylar mobil: dokunma hedefleri + kart yüksekliği
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
      const page = await ctx.newPage();
      await openRoute(page, { route: '/onaylar', as: 'admin', base });
      out.onaylarMobile = await page.evaluate(`(() => { const __name=(f)=>f; return (${(() => {
        const cards = Array.from(document.querySelectorAll('div.grid > div')) as HTMLElement[];
        const heights = cards.map((c) => Math.round(c.getBoundingClientRect().height));
        const btns = Array.from(document.querySelectorAll('div.grid > div button, div.grid > div a')) as HTMLElement[];
        const small = btns.filter((b) => b.getBoundingClientRect().height < 44);
        const titles = Array.from(document.querySelectorAll('div.grid > div .truncate')) as HTMLElement[];
        return {
          cardCount: cards.length,
          cardHeights: [Math.min(...heights), heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)], Math.max(...heights)],
          actionButtons: btns.length,
          actionButtonsBelow44: small.length,
          actionButtonHeights: Array.from(new Set(btns.map((b) => Math.round(b.getBoundingClientRect().height)))),
          truncatedTitles: titles.filter((t) => t.scrollWidth > t.clientWidth + 1).length,
          pageScrollHeight: document.documentElement.scrollHeight,
        };
      }).toString()})(); })()`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
