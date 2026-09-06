/**
 * Tur 3 kokpit ekran görüntüsü toplayıcı: 5 rol × {1440x900, 390x844}
 *   tsx scripts/shot-kokpit-r3.ts
 * Çıktı: artifacts/screens/kokpit-<rol>/{desktop,mobile}.png
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const ROLES = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];
const VIEWPORTS = {
  desktop: { width: 1440, height: 900, mobile: false },
  mobile: { width: 390, height: 844, mobile: true },
} as const;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  try {
    for (const as of ROLES) {
      const outDir = resolve(process.cwd(), 'artifacts', 'screens', `kokpit-${as}`);
      mkdirSync(outDir, { recursive: true });
      for (const kind of ['desktop', 'mobile'] as const) {
        const vp = VIEWPORTS[kind];
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 2,
          isMobile: vp.mobile,
          hasTouch: vp.mobile,
          locale: 'tr-TR',
          timezoneId: 'Europe/Istanbul',
          colorScheme: 'light',
        });
        const page = await ctx.newPage();
        await openRoute(page, { base, route: '/kokpit', as });
        const file = join(outDir, `${kind}.png`);
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
        console.log(`✓ ${as} [${kind}] → ${file}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
