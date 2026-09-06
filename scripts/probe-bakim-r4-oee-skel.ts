/** Tur 4 — /bakim/oee yükleme iskeleti ile gerçek düzenin blok geometrisi karşılaştırması (kriter 7). */
import { defaultBaseUrl, launchBrowser, login, resolveAccount } from './lib/browser';

const geom = () => {
  const r0 = (n: number) => Math.round(n);
  const main = document.querySelector<HTMLElement>('main') ?? document.body;
  const blocks: unknown[] = [];
  for (const el of Array.from(main.querySelectorAll<HTMLElement>('[data-slot="skeleton"]'))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    blocks.push({ top: r0(r.top + window.scrollY), w: r0(r.width), h: r0(r.height) });
  }
  const chips = Array.from(main.querySelectorAll<HTMLElement>('a[href*="/bakim/oee"]')).map((el) => {
    const r = el.getBoundingClientRect();
    return { t: (el.textContent || '').trim(), top: r0(r.top + window.scrollY), h: r0(r.height), w: r0(r.width), cls: (el.className || '').toString().includes('active') };
  });
  return { skeletons: blocks, chips };
};

async function main() {
  const route = '/bakim/oee';
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await login(page, base, resolveAccount('bakim'), route);
  await page.waitForFunction(() => document.querySelectorAll('[aria-busy], [data-slot="skeleton"]').length === 0, null, { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.evaluate(() => { (globalThis as unknown as { __name?: unknown }).__name = (f: unknown) => f; });
  const real = await page.evaluate(geom);
  await page.goto(`${base}${route}?lineId=x-${Date.now()}`, { waitUntil: 'commit' });
  let skel: unknown = null;
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => { (globalThis as unknown as { __name?: unknown }).__name = (f: unknown) => f; }).catch(() => {});
    const g = await page.evaluate(geom).catch(() => null);
    if (g && (g as { skeletons: unknown[] }).skeletons.length > 0) { skel = g; break; }
    await page.waitForTimeout(50);
  }
  process.stdout.write(JSON.stringify({ real, skel }, null, 1) + '\n');
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
