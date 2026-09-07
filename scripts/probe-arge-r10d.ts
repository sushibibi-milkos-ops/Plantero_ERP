/** Tur 10 — CDP forcePseudoState ile :active + :focus-visible birlikteyken kart ölçeği. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = process.env.PID ?? '';
const base = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  await openRoute(page, { base, route: `/arge/projeler/${PID}/board`, as: 'admin' });
  const card = page.locator('button', { hasText: 'Pazar araştırması' }).first();
  await card.focus();
  const cdp = await ctx.newCDPSession(page);
  const { root } = (await cdp.send('DOM.getDocument', { depth: -1 })) as { root: { nodeId: number } };
  await card.evaluate((el) => el.setAttribute('id', 'probe-card'));
  const { nodeId } = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#probe-card' })) as { nodeId: number };
  await cdp.send('CSS.enable');
  await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['active', 'focus-visible'] });
  await page.waitForTimeout(200);
  const withFocus = await card.evaluate((el) => getComputedStyle(el).transform);
  await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['active'] });
  await page.waitForTimeout(200);
  const activeOnly = await card.evaluate((el) => getComputedStyle(el).transform);
  console.log(JSON.stringify({ rootNode: root.nodeId, withFocusVisibleAndActive: withFocus, activeOnly }));
  await ctx.close();
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
