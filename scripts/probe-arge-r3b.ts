/**
 * gorsel-critic Tur 3 — Ar-Ge ikinci ölçüm turu:
 *  (a) /arge/receteler 390px mobil kart alt başlık ↔ "·" ayracı arası boşluk,
 *  (b) proje reçeteleri 390px tablo yatay taşması + görünür sütunlar + kaydırma ipucu,
 *  (c) proje reçeteleri yükleniyor fazı (spinner süresi + panel yükseklik sıçraması).
 */
import { ACCOUNTS, defaultBaseUrl, launchBrowser, login } from './lib/browser';

const pid = process.argv[2]!;
const base = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // (a) + (b)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await login(page, base, ACCOUNTS.admin!, '/arge/receteler');
    await page.goto(`${base}/arge/receteler`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    out.metaGap = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('ul > li'));
      return cards.map((li) => {
        const seps = Array.from(li.querySelectorAll('span[aria-hidden]')).filter((s) => /·/.test(s.textContent ?? ''));
        const sep = seps[0] as HTMLElement | undefined;
        if (!sep) return { text: (li as HTMLElement).innerText.replace(/\n/g, ' '), sep: null };
        const sr = sep.getBoundingClientRect();
        // ayracın solundaki en yakın metin kutusu
        const prev = sep.previousElementSibling as HTMLElement | null;
        const parentPrev = sep.parentElement?.previousElementSibling as HTMLElement | null;
        const left = prev ?? parentPrev;
        const next = sep.nextElementSibling as HTMLElement | null;
        return {
          text: (li as HTMLElement).innerText.replace(/\n/g, ' '),
          sepText: JSON.stringify(sep.textContent),
          sepRect: { l: Math.round(sr.left), r: Math.round(sr.right), w: Math.round(sr.width) },
          gapLeft: left ? Math.round(sr.left - left.getBoundingClientRect().right) : null,
          leftText: left?.innerText?.slice(0, 30) ?? null,
          gapRight: next ? Math.round(next.getBoundingClientRect().left - sr.right) : null,
          nextText: next?.innerText?.slice(0, 20) ?? null,
        };
      });
    });
    await ctx.close();
  }

  // (b) + (c)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await login(page, base, ACCOUNTS.admin!, `/arge/projeler/${pid}/receteler`);
    const samples: Array<Record<string, unknown>> = [];
    await page.goto(`${base}/arge/projeler/${pid}/receteler`, { waitUntil: 'commit' });
    const t0 = Date.now();
    for (let i = 0; i < 60; i++) {
      const s = await page
        .evaluate(() => {
          const panel = Array.from(document.querySelectorAll('div')).find((d) => d.className.includes('rounded-xl') && d.className.includes('bg-card')) as HTMLElement | undefined;
          return {
            busy: /Yükleniyor/.test(document.body.innerText),
            panelH: panel ? Math.round(panel.getBoundingClientRect().height) : null,
            hasTable: !!document.querySelector('table'),
            docH: document.documentElement.scrollHeight,
          };
        })
        .catch(() => null);
      if (s) samples.push({ t: Date.now() - t0, ...s });
      if (s && !s.busy && s.hasTable) break;
      await page.waitForTimeout(100);
    }
    out.loadingPhase = {
      firstBusySample: samples.find((s) => s.busy) ?? null,
      lastBusySample: [...samples].reverse().find((s) => s.busy) ?? null,
      firstReadySample: samples.find((s) => !s.busy && s.hasTable) ?? null,
      totalSamples: samples.length,
      timeline: samples.map((s) => `${s.t}ms busy=${s.busy} panelH=${s.panelH} table=${s.hasTable} docH=${s.docH}`),
    };

    await page.waitForTimeout(600);
    out.tableOverflow = await page.evaluate(() => {
      const table = document.querySelector('table') as HTMLElement | null;
      if (!table) return null;
      const wrap = table.parentElement as HTMLElement;
      const ths = Array.from(table.querySelectorAll('thead th')).map((th) => {
        const r = th.getBoundingClientRect();
        const wr = wrap.getBoundingClientRect();
        return { t: (th.textContent ?? '').trim(), l: Math.round(r.left), r: Math.round(r.right), visible: r.left >= wr.left - 1 && r.right <= wr.right + 1 };
      });
      return {
        wrapClass: wrap.className,
        scrollW: wrap.scrollWidth,
        clientW: wrap.clientWidth,
        hiddenPx: wrap.scrollWidth - wrap.clientWidth,
        headers: ths,
        visibleHeaders: ths.filter((t) => t.visible).map((t) => t.t),
        hiddenHeaders: ths.filter((t) => !t.visible).map((t) => t.t),
        hasFadeAffordance: /scroll-fade|scrollbar-thin/.test(wrap.className),
      };
    });
    await ctx.close();
  }

  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
