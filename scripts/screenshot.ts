/**
 * Ekran görüntüsü aracı: `pnpm shot /route [--as admin] [--base http://localhost:3000]`
 * Giriş yapar, 1440×900 (desktop) ve 390×844 (mobile) görüntüleri
 * artifacts/screens/<slug>/{desktop,mobile}.png dosyalarına yazar.
 * Chromium ikilisi /opt/pw-browsers altından (glob ile) bulunur.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';

const ACCOUNTS: Record<string, { email: string; password: string }> = {
  admin: { email: 'admin@plantero.local', password: 'Plantero!2026' },
  genel_mudur: { email: 'gm@plantero.local', password: 'Plantero!2026' },
  muhasebe: { email: 'muhasebe@plantero.local', password: 'Plantero!2026' },
  depo: { email: 'depo@plantero.local', password: 'Plantero!2026' },
  uretim_operatoru: { email: 'operator@plantero.local', password: 'Plantero!2026' },
  uretim_sefi: { email: 'uretim@plantero.local', password: 'Plantero!2026' },
  satis: { email: 'satis@plantero.local', password: 'Plantero!2026' },
  satin_alma: { email: 'satinalma@plantero.local', password: 'Plantero!2026' },
  kalite: { email: 'kalite@plantero.local', password: 'Plantero!2026' },
  bakim: { email: 'bakim@plantero.local', password: 'Plantero!2026' },
  arge: { email: 'arge@plantero.local', password: 'Plantero!2026' },
  ihracat: { email: 'ihracat@plantero.local', password: 'Plantero!2026' },
};

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, mobile: false },
  mobile: { width: 390, height: 844, mobile: true },
} as const;

function parseArgs(argv: string[]) {
  let route = '/kokpit';
  let as = 'admin';
  let base = process.env.PLAYWRIGHT_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
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

/** /ayarlar/kullanicilar → ayarlar-kullanicilar ; / → root */
function slugOf(route: string): string {
  const s = route
    .split('?')[0]!
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return s || 'root';
}

function findChromium(): string | undefined {
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!existsSync(dir)) return undefined;
  const candidates = readdirSync(dir)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort();
  for (const c of candidates.reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const bin = join(dir, c, rel);
      if (existsSync(bin)) return bin;
    }
  }
  return undefined;
}

async function login(page: Page, base: string, account: { email: string; password: string }, next: string) {
  await page.goto(`${base}/login?next=${encodeURIComponent(next)}`, { waitUntil: 'networkidle' });
  if (!page.url().includes('/login')) return; // zaten oturum var (olmamalı, context yeni)
  await page.getByLabel('E-posta').fill(account.email);
  await page.getByLabel('Şifre', { exact: true }).fill(account.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
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
  const account = ACCOUNTS[opts.as];
  if (!account) throw new Error(`Bilinmeyen hesap: ${opts.as} (${Object.keys(ACCOUNTS).join(', ')})`);
  if (!opts.route.startsWith('/login')) await login(page, opts.base, account, opts.route);
  if (!page.url().startsWith(`${opts.base}${opts.route.split('?')[0]}`)) {
    await page.goto(`${opts.base}${opts.route}`, { waitUntil: 'networkidle' });
  } else {
    await page.waitForLoadState('networkidle');
  }
  // Giriş animasyonları (enter-up 220ms) ve NumberFlow bitene dek bekle
  await page.waitForTimeout(600);
  await page.screenshot({ path: outFile, fullPage: opts.full, animations: 'disabled' });
  await ctx.close();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const slug = slugOf(opts.route);
  const outDir = resolve(process.cwd(), 'artifacts', 'screens', slug);
  mkdirSync(outDir, { recursive: true });

  const executablePath = findChromium();
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
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
