/** Tur 14 kritik ölçümü (c) — boş durum (arama kutusuna yazarak) + gerçek Tab odak halkası. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const base = defaultBaseUrl();

async function run() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  for (const [key, route, ph] of [
    ['projeler', '/arge/projeler', 'Proje veya kod ara…'],
    ['receteler', '/arge/receteler', 'Reçete veya proje ara…'],
  ] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await ctx.newPage();
    await openRoute(p, { base, route, as: 'admin' });

    // gerçek Tab ile tablo satırına ulaş
    let focus: unknown = null;
    for (let i = 0; i < 90; i++) {
      await p.keyboard.press('Tab');
      const hit = await p.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || !a.closest('tbody')) return null;
        const cs = getComputedStyle(a);
        return { tag: a.tagName, outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, offset: cs.outlineOffset, boxShadow: cs.boxShadow.slice(0, 100), transition: cs.transitionProperty + ' ' + cs.transitionDuration + ' ' + cs.transitionTimingFunction };
      });
      if (hit) { focus = hit; break; }
    }
    out[`${key}_rowFocus`] = focus;

    // boş durum: arama kutusuna yaz
    const input = p.getByPlaceholder(ph);
    await input.click();
    await input.fill('zzzzyok');
    await p.waitForTimeout(700);
    out[`${key}_empty`] = await p.evaluate(() => {
      const main = document.querySelector('main');
      const rows = main?.querySelectorAll('tbody tr').length ?? 0;
      // boş durum bloğu
      const texts = [...(main?.querySelectorAll('p, h2, h3, div') ?? [])]
        .filter((e) => e.children.length === 0 && (e.textContent ?? '').trim())
        .map((e) => (e.textContent ?? '').trim())
        .slice(-8);
      return { rows, tail: texts, buttons: [...(main?.querySelectorAll('button') ?? [])].map((b) => (b.textContent ?? '').trim()).filter(Boolean), fullText: (main?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) };
    });
    await p.screenshot({ path: `artifacts/critic/arge-r14-bos-${key}.png` });
    await ctx.close();
  }

  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
}

run().catch((e) => { console.error(e); process.exit(1); });
