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

/**
 * Üst bardaki kullanıcı menüsünden çıkış yapar ve /login'e dönmeyi bekler.
 * Dev sunucusunda ilk derleme sırasında sayfa henüz yerleşmeden tıklanırsa çıkış aksiyonu
 * yarışa girebiliyor; bu yüzden önce ağın sakinleşmesi beklenir, sonunda da oturum çerezinin
 * gerçekten silindiği doğrulanır (URL tek başına yeterli kanıt değil: middleware çerez varsa
 * /login'i /kokpit'e geri yönlendirir).
 */
export async function logout(page: Page): Promise<void> {
  // 'networkidle' BEKLENMEZ: bildirim zili 30 sn'de bir yokladığı ve bazı ekranlar canlı yenilendiği için ağ
  // hiç sakinleşmeyebilir (kapanış kapısında 60 sn zaman aşımıyla düştü). Gerçek ön koşul: kullanıcı menüsü
  // görünür VE hydrate olmuş — tıklayınca açılır menüde 'logout' görünene kadar tıklama yinelenir.
  const menu = page.getByTestId('user-menu');
  await expect(menu).toBeVisible();
  await expect
    .poll(
      async () => {
        if (await page.getByTestId('logout').isVisible().catch(() => false)) return true;
        await menu.click();
        return page.getByTestId('logout').isVisible().catch(() => false);
      },
      { message: 'kullanıcı menüsü açılmalı (hydration)', timeout: 15_000, intervals: [300, 600, 1000] },
    )
    .toBe(true);
  await page.getByTestId('logout').click();
  await page.waitForURL(/\/login/, { timeout: 30_000 });
  await expect
    .poll(async () => (await page.context().cookies()).some((c) => c.name === 'plantero_session'), {
      message: 'çıkış sonrası plantero_session çerezi silinmeli',
      timeout: 10_000,
    })
    .toBe(false);
}
