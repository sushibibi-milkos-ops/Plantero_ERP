/**
 * Geçici: gorsel-critic turu için uzun bekleme + tablet viewport'lu çekim.
 * `tsx scripts/shot2.ts <kind> <route> [--as rol]` — kind: desktop|mobile|tablet
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const ACCOUNTS: Record<string, { email: string; password: string }> = {
  admin: { email: 'admin@plantero.local', password: 'Plantero!2026' },
  uretim_operatoru: { email: 'operator@plantero.local', password: 'Plantero!2026' },
  uretim_sefi: { email: 'uretim@plantero.local', password: 'Plantero!2026' },
};

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, mobile: false },
  mobile: { width: 390, height: 844, mobile: true },
  tablet: { width: 1024, height: 768, mobile: false },
} as const;

function slugOf(route: string): string {
  const s = route.split('?')[0]!.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return s || 'root';
}

function findChromium(): string | undefined {
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!existsSync(dir)) return undefined;
  for (const c of readdirSync(dir).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
      const bin = join(dir, c, rel);
      if (existsSync(bin)) return bin;
    }
  }
  return undefined;
}

async function login(page: Page, base: string, acc: { email: string; password: string }, next: string) {
  await page.goto(`${base}/login?next=${encodeURIComponent(next)}`, { waitUntil: 'networkidle' });
  if (!page.url().includes('/login')) return;
  await page.getByLabel('E-posta').fill(acc.email);
  await page.getByLabel('Şifre', { exact: true }).fill(acc.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
}

async function main() {
  const argv = process.argv.slice(2);
  const kind = argv[0] as keyof typeof VIEWPORTS;
  const route = argv[1]!;
  let as = 'admin';
  let name = kind as string;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--as') as = argv[++i]!;
    if (argv[i] === '--name') name = argv[++i]!;
  }
  const base = 'http://localhost:3000';
  const vp = VIEWPORTS[kind];
  const outDir = resolve(process.cwd(), 'artifacts', 'screens', slugOf(route));
  mkdirSync(outDir, { recursive: true });
  const executablePath = findChromium();
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
  });
  await ctx.addInitScript(() => {
    // Next.js dev overlay düğmesini gizle (ekran görüntüsünü kirletiyor)
    const s = document.createElement('style');
    s.textContent = 'nextjs-portal{display:none!important}';
    document.documentElement.appendChild(s);
  });
  const page = await ctx.newPage();
  await login(page, base, ACCOUNTS[as]!, route);
  if (!page.url().startsWith(`${base}${route.split('?')[0]}`)) {
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
  }
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(4000);
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  console.log(`OK ${route} [${name}] -> ${file}  url=${page.url()}`);
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
