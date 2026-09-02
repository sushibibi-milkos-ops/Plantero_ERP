import { expect, type Page } from '@playwright/test';

/** docs/TEST-ACCOUNTS.md ile birebir (seed hesapları) */
export const ACCOUNTS = {
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
} as const;

export type TestRole = keyof typeof ACCOUNTS;

/**
 * Giriş formu üzerinden oturum açar (cookie: plantero_session).
 * `next` verilirse giriş sonrası oraya yönlenmesi beklenir.
 */
export async function loginAs(page: Page, role: TestRole = 'admin', next?: string): Promise<void> {
  const acc = ACCOUNTS[role];
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  await page.getByLabel('E-posta').fill(acc.email);
  await page.getByLabel('Şifre', { exact: true }).fill(acc.password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  await expect(page.getByTestId('user-menu')).toBeVisible();
}

/** Üst bardaki kullanıcı menüsünden çıkış yapar ve /login'e dönmeyi bekler */
export async function logout(page: Page): Promise<void> {
  await page.getByTestId('user-menu').click();
  await page.getByTestId('logout').click();
  await page.waitForURL(/\/login/, { timeout: 30_000 });
}
