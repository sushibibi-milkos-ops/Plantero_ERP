/** Tur 10 — kanban kartı / kolon kontrolleri odak halkası (CDP forcePseudoState + gerçek Tab). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = process.env.PID ?? '';
const base = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: `/arge/projeler/${PID}/board`, as: 'admin' });
  const cdp = await ctx.newCDPSession(page);
  const { root } = (await cdp.send('DOM.getDocument', { depth: -1 })) as { root: { nodeId: number } };
  await cdp.send('CSS.enable');

  const out: Record<string, unknown> = {};
  const targets: Array<[string, string]> = [
    ['kart', 'Pazar araştırması'],
    ['kartEkle', 'Kart ekle'],
    ['kolonChip', 'Formülasyon'],
  ];
  for (const [key, text] of targets) {
    const el = page.locator('button', { hasText: text }).first();
    await el.evaluate((e) => e.setAttribute('id', 'probe-el'));
    const { nodeId } = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#probe-el' })) as { nodeId: number };
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['focus', 'focus-visible'] });
    await page.waitForTimeout(150);
    out[key] = await el.evaluate((e) => {
      const cs = getComputedStyle(e);
      return { outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow, border: `${cs.borderTopWidth} ${cs.borderTopColor}` };
    });
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    await el.evaluate((e) => e.removeAttribute('id'));
  }

  // Gerçek klavye: sayfa başından Tab'layıp kanban kartına gelene dek ilerle, sonra ekran görüntüsü
  await page.keyboard.press('Tab');
  for (let i = 0; i < 60; i++) {
    const isCard = await page.evaluate(() => /Pazar araştırması/.test(document.activeElement?.textContent ?? ''));
    if (isCard) break;
    await page.keyboard.press('Tab');
  }
  out.tabbedTo = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      text: (el.textContent ?? '').trim().slice(0, 24),
      matchesFV: el.matches(':focus-visible'),
      outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
      boxShadow: cs.boxShadow,
    };
  });
  await page.screenshot({ path: 'artifacts/critic/arge-r10-board-focus.png', clip: { x: 360, y: 380, width: 760, height: 260 } });
  console.log(JSON.stringify(out));
  await ctx.close();
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
