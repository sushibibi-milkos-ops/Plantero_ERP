/** Tur 5 doğrulama — /bakim/oee ve /bakim/planlar yükleme iskeleti geometrisi (bakim-oee-05, bakim-planlar-03). */
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
  const toolbarInput = main.querySelector('input[aria-label="Tabloda ara"]');
  const tableHeader = main.querySelector('.border-b.border-border\\/60.bg-muted\\/40');
  // Bu rotanın KENDİ iskeletine özgü işaretçi (paylaşılan (app)/loading.tsx ile karışmasın diye):
  // KpiStripRow sarmalayıcısı (scroll-fade-x) ya da gerçek sütun başlıklı DataTableSkeleton üst şeridi.
  const routeSpecificMarker = Boolean(main.querySelector('.scroll-fade-x')) || Boolean(tableHeader);
  return {
    skeletons: blocks,
    hasRealToolbar: Boolean(toolbarInput),
    tableHeaderTop: tableHeader ? r0(tableHeader.getBoundingClientRect().top) : null,
    routeSpecificMarker,
  };
};

async function probeRoute(route: string, otherRoute: string) {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await login(page, base, resolveAccount('bakim'), route);
  await page.waitForFunction(() => document.querySelectorAll('[aria-busy], [data-slot="skeleton"]').length === 0, null, { timeout: 45_000 }).catch(() => {});
  await page.evaluate(() => { (globalThis as unknown as { __name?: unknown }).__name = (f: unknown) => f; });
  const real = await page.evaluate(geom);
  // Başka bir rotaya git, sonra hedefe geri dön ('commit' ile yalnızca gezinme başlasın) — RSC akışı
  // sırasında loading.tsx anlık render olur, hızlıca yakalanır.
  await page.goto(`${base}${otherRoute}`, { waitUntil: 'networkidle' });
  await page.goto(`${base}${route}?probe=${Date.now()}`, { waitUntil: 'commit' });
  let skel: unknown = null;
  let lastAny: unknown = null;
  for (let i = 0; i < 100; i++) {
    await page.evaluate(() => { (globalThis as unknown as { __name?: unknown }).__name = (f: unknown) => f; }).catch(() => {});
    const g = await page.evaluate(geom).catch(() => null);
    if (g && (g as { skeletons: unknown[] }).skeletons.length > 0) {
      lastAny = g;
      if ((g as { routeSpecificMarker: boolean }).routeSpecificMarker) { skel = g; break; }
    }
    await page.waitForTimeout(25);
  }
  if (!skel) skel = lastAny;
  await browser.close();
  return { route, real, skel };
}

async function main() {
  const results = [];
  results.push(await probeRoute('/bakim/oee', '/bakim/makineler'));
  results.push(await probeRoute('/bakim/planlar', '/bakim/oee'));
  process.stdout.write(JSON.stringify(results, null, 1) + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
