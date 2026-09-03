/**
 * Ekran görüntüsü aracı: `pnpm shot /route [--as admin] [--base http://localhost:3000]`
 * Giriş yapar, 1440×900 (desktop) ve 390×844 (mobile) görüntüleri
 * artifacts/screens/<slug>/{desktop,mobile}.png dosyalarına yazar.
 * Giriş, Chromium bulma ve RSC/iskelet bekleme sağlamlaştırmaları `scripts/lib/browser.ts`'de —
 * `pnpm measure` ile paylaşılır, iki araç aynı sayfayı aynı koşullarda görür.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Browser } from '@playwright/test';
import { defaultBaseUrl, launchBrowser, openRoute, slugOf } from './lib/browser';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, mobile: false },
  mobile: { width: 390, height: 844, mobile: true },
} as const;

function parseArgs(argv: string[]) {
  let route = '/kokpit';
  let as = 'admin';
  let base = defaultBaseUrl();
  let full = true;
  let dark = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--as') as = argv[++i] ?? as;
    else if (a.startsWith('--as=')) as = a.slice(5);
    else if (a === '--base') base = argv[++i] ?? base;
    else if (a.startsWith('--base=')) base = a.slice(7);
    else if (a === '--viewport-only') full = false;
    else if (a === '--dark') dark = true;
    else if (a.startsWith('/')) route = a;
  }
  return { route, as, base: base.replace(/\/$/, ''), full, dark };
}

async function shoot(browser: Browser, opts: ReturnType<typeof parseArgs>, kind: keyof typeof VIEWPORTS, outFile: string) {
  const vp = VIEWPORTS[kind];
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    colorScheme: opts.dark ? 'dark' : 'light',
  });
  const page = await ctx.newPage();
  // Soğuk derleme timeout'u, giriş, aria-busy + Skeleton beklemesi ve giriş animasyonu payı
  // openRoute içinde (bkz. scripts/lib/browser.ts).
  await openRoute(page, opts);
  await page.screenshot({ path: outFile, fullPage: opts.full, animations: 'disabled' });
  await ctx.close();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const slug = slugOf(opts.route);
  const outDir = resolve(process.cwd(), 'artifacts', 'screens', slug);
  mkdirSync(outDir, { recursive: true });

  const browser = await launchBrowser();
  try {
    for (const kind of ['desktop', 'mobile'] as const) {
      const file = join(outDir, `${kind}.png`);
      await shoot(browser, opts, kind, file);
      console.log(`✓ ${opts.route} [${kind}] → ${file}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
