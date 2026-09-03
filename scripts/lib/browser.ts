/**
 * `pnpm shot` ve `pnpm measure` betiklerinin ortak Playwright altyapısı:
 * test hesapları, Chromium ikilisi bulma, giriş akışı ve RSC/iskelet bekleme.
 * Sağlamlaştırmalar (soğuk derleme timeout'u, aria-busy + Skeleton beklemesi) tek yerde
 * durur; iki betik aynı sayfayı aynı koşullarda görür (docs/DESIGN-SCORECARD.md, kural 6).
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';

export type Account = { email: string; password: string };

export const ACCOUNTS: Record<string, Account> = {
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

export function resolveAccount(as: string): Account {
  const account = ACCOUNTS[as];
  if (!account) throw new Error(`Bilinmeyen hesap: ${as} (${Object.keys(ACCOUNTS).join(', ')})`);
  return account;
}

export function defaultBaseUrl(): string {
  return (process.env.PLAYWRIGHT_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

/** /ayarlar/kullanicilar → ayarlar-kullanicilar ; / → root */
export function slugOf(route: string): string {
  const s = route
    .split('?')[0]!
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return s || 'root';
}

/** Chromium ikilisi /opt/pw-browsers (PLAYWRIGHT_BROWSERS_PATH) altından glob ile bulunur; `playwright install` çalıştırılmaz. */
export function findChromium(): string | undefined {
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

export async function launchBrowser(): Promise<Browser> {
  const executablePath = findChromium();
  return chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
}

export async function login(page: Page, base: string, account: Account, next: string) {
  await page.goto(`${base}/login?next=${encodeURIComponent(next)}`, { waitUntil: 'networkidle' });
  if (!page.url().includes('/login')) return; // zaten oturum var (olmamalı, context yeni)
  await page.getByLabel('E-posta').fill(account.email);
  await page.getByLabel('Şifre', { exact: true }).fill(account.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60_000 });
}

/**
 * Giriş yapıp rotayı açar ve sayfa gerçekten "oturana" dek bekler.
 *
 * - Soğuk derleme (ilk istekte Next.js route'u derler) + RSC veri getirme 30s'in üstüne
 *   çıkabiliyor; varsayılan navigasyon timeout'u 120s'ye çıkarılır (/ana-veri/receteler gibi
 *   rotalar aksi halde sahte timeout ile düşüyordu).
 * - 'networkidle' RSC akışının bittiğini garanti etmez: loading.tsx iskeletleri kendi
 *   aria-busy'sini gerçek içerik gelene dek taşır; bileşen seviyeli `Skeleton` primitifi
 *   (`data-slot="skeleton"`, `.animate-pulse`) aria-busy sarmalayıcısı OLMADAN da kullanılabiliyor.
 *   İkisi birlikte beklenir (45s; en yavaş gözlemlenen rota 39s) — aksi halde gri baloncuklu
 *   iskelet ölçülür/çekilir.
 * - Giriş animasyonları (enter-up 220ms) ve NumberFlow bitene dek 600ms ek bekleme.
 */
export async function openRoute(page: Page, opts: { base: string; route: string; as: string }) {
  page.setDefaultNavigationTimeout(120_000);
  const account = resolveAccount(opts.as);
  if (!opts.route.startsWith('/login')) await login(page, opts.base, account, opts.route);
  if (!page.url().startsWith(`${opts.base}${opts.route.split('?')[0]}`)) {
    await page.goto(`${opts.base}${opts.route}`, { waitUntil: 'networkidle', timeout: 120_000 });
  } else {
    await page.waitForLoadState('networkidle', { timeout: 120_000 });
  }
  await page
    .waitForFunction(() => document.querySelectorAll('[aria-busy], [data-slot="skeleton"], .animate-pulse').length === 0, null, { timeout: 45_000 })
    .catch(() => {});
  await page.waitForTimeout(600);
}
