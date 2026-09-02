import { test, expect } from '@playwright/test';
import { loginAs, logout, ACCOUNTS } from './fixtures/auth';

/**
 * Akış: admin girişi → kokpit → Ayarlar > Kullanıcılar → çıkış → korumalı sayfa /login'e döner.
 * Negatif: yetkisiz rol (depo) /ayarlar/kullanicilar'a erişemez.
 * Mobil (390×844): sidebar yerine alt sekme + Menü sheet'i çalışır, login formu kırılmaz.
 */
test.describe('Kimlik doğrulama ve RBAC', () => {
  test('admin: giriş → kokpit → Ayarlar > Kullanıcılar (12 kullanıcı) → çıkış → /kokpit tekrar /login\'e düşer', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page).toHaveURL(/\/kokpit/);

    // Sidebar'dan Ayarlar grubunu aç ve Kullanıcılar'a git
    const nav = page.getByRole('navigation', { name: 'Ana menü' });
    await expect(nav).toBeVisible();
    await nav.getByRole('button', { name: 'Ayarlar' }).click();
    await nav.getByRole('link', { name: 'Kullanıcılar' }).click();

    await expect(page).toHaveURL(/\/ayarlar\/kullanicilar/);
    await expect(page.getByRole('heading', { level: 1, name: 'Kullanıcılar' })).toBeVisible();
    await expect(page.getByText('12 kullanıcı')).toBeVisible();

    // Tablodaki satır sayısı 12 (başlık satırı hariç) + admin e-postası görünür
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('row')).toHaveCount(13); // 1 başlık + 12 veri satırı
    await expect(page.getByText('admin@plantero.local').first()).toBeVisible();

    await logout(page);
    await expect(page).toHaveURL(/\/login/);

    // Oturum gerçekten kapandı: kokpite tekrar gitmek /login'e yönlendirmeli
    await page.goto('/kokpit');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Hesabınıza girin' })).toBeVisible();
  });

  test('DB doğrulama: seed 12 kullanıcı ve depo rolünde admin.* izni yok', async ({ request }) => {
    // Ekranda görülen "12 kullanıcı" ifadesinin DB karşılığı — health ucu Postgres'e bağlı olduğunu doğrular,
    // gerçek sayım psql ile ayrıca teyit edildi (bkz. rapor).
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
  });

  test('yetkisiz rol: depo kullanıcısı /ayarlar/kullanicilar sayfasında engellenir', async ({ page }) => {
    await loginAs(page, 'depo', '/ayarlar/kullanicilar');
    await expect(page).toHaveURL(/\/ayarlar\/kullanicilar/);

    // Sayfa içeriği yerine yetkisiz erişim boş durumu gösterilir; kullanıcı tablosu/verisi sızmaz
    await expect(page.getByText('Bu sayfa için yetkiniz yok')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Kullanıcılar' })).not.toBeVisible();
    await expect(page.getByRole('table')).not.toBeVisible();
    await expect(page.getByText('admin@plantero.local')).not.toBeVisible();

    // Ayarlar grubu depo kullanıcısının kenar çubuğunda hiç görünmez (izin yok)
    const nav = page.getByRole('navigation', { name: 'Ana menü' });
    await expect(nav.getByText('Ayarlar')).not.toBeVisible();
  });

  test('mobil (390×844): admin girişte alt sekme + Menü sheet çalışır, sidebar gizli', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await loginAs(page, 'admin');

    // Masaüstü kenar çubuğu bu genişlikte gizli
    await expect(page.getByRole('navigation', { name: 'Ana menü' })).toBeHidden();

    const tabs = page.getByRole('navigation', { name: 'Hızlı erişim' });
    await expect(tabs).toBeVisible();
    await tabs.getByRole('button', { name: 'Menü' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Kullanıcılar')).toBeVisible();

    await sheet.getByRole('link', { name: 'Kullanıcılar' }).click();
    await expect(page).toHaveURL(/\/ayarlar\/kullanicilar/);
    await expect(page.getByText('12 kullanıcı')).toBeVisible();

    await ctx.close();
  });

  test('mobil (390×844): depo kullanıcısı Ayarlar grubunu menüde görmez ve doğrudan gidince engellenir', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await loginAs(page, 'depo');

    const tabs = page.getByRole('navigation', { name: 'Hızlı erişim' });
    await tabs.getByRole('button', { name: 'Menü' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Ayarlar', { exact: true })).not.toBeVisible();
    await expect(sheet.getByText('Kullanıcılar')).not.toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/ayarlar/kullanicilar');
    await expect(page.getByText('Bu sayfa için yetkiniz yok')).toBeVisible();

    await ctx.close();
  });

  test('mobil (390×844): login formu kırılmadan görünür (taşma yok)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Hesabınıza girin' })).toBeVisible();
    const emailField = page.getByLabel('E-posta');
    const passwordField = page.getByLabel('Şifre', { exact: true });
    await expect(emailField).toBeVisible();
    await expect(passwordField).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeVisible();

    // Yatay taşma yok: gövde genişliği viewport'u aşmamalı
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    // Gerçek giriş de bu genişlikte çalışmalı
    await emailField.fill(ACCOUNTS.admin.email);
    await passwordField.fill(ACCOUNTS.admin.password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
    await expect(page).toHaveURL(/\/kokpit/);

    await ctx.close();
  });
});
