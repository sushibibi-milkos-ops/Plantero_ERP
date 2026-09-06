import { test, expect } from '@playwright/test';
import { loginAs, logout } from './fixtures/auth';

test.describe('Kabuk: giriş → kokpit → çıkış', () => {
  test('sağlık ucu Postgres ile ok döner', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toMatchObject({ ok: true, db: true });
  });

  test('oturumsuz istek /login sayfasına yönlenir', async ({ page }) => {
    await page.goto('/kokpit');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Hesabınıza girin' })).toBeVisible();
  });

  test('hatalı şifre hata mesajı gösterir', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-posta').fill('admin@plantero.local');
    await page.getByLabel('Şifre', { exact: true }).fill('yanlis-sifre');
    await page.getByTestId('login-submit').click();
    await expect(page.getByRole('alert').filter({ hasText: 'E-posta veya şifre hatalı' })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('admin giriş yapar, kokpit görünür, çıkış yapar', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page).toHaveURL(/\/kokpit/);
    // Selamlama (saate göre "Günaydın/İyi günler/…") Tur 13'ten beri h1'de değil, üst satırda (eyebrow); h1 "Kokpit".
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kokpit');
    await expect(page.getByText(/^(Günaydın|İyi günler|İyi akşamlar|İyi geceler)/)).toBeVisible();
    // Kokpit rol bazlı KPI panosuna dönüştü (docs/modules/kokpit.md): admin GM panosunda kart başlığı "Bugünkü net ciro".
    await expect(page.getByText('Bugünkü net ciro')).toBeVisible();
    // Kenar çubuğu ana menü grupları
    const nav = page.getByRole('navigation', { name: 'Ana menü' });
    await expect(nav).toBeVisible();
    await expect(nav.getByText('Muhasebe')).toBeVisible();

    await logout(page);
    await expect(page).toHaveURL(/\/login/);
    // Oturum gerçekten kapandı: korumalı sayfa tekrar /login'e düşer
    await page.goto('/kokpit');
    await expect(page).toHaveURL(/\/login/);
  });

  test('admin kullanıcı listesi gerçek veriyle gelir', async ({ page }) => {
    await loginAs(page, 'admin', '/ayarlar/kullanicilar');
    await expect(page).toHaveURL(/\/ayarlar\/kullanicilar/);
    await expect(page.getByRole('heading', { level: 1, name: 'Kullanıcılar' })).toBeVisible();
    await expect(page.getByText('admin@plantero.local').first()).toBeVisible();
  });

  test('mobil (375px): alt sekme çubuğu ve menü sheet', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await loginAs(page, 'admin');
    const tabs = page.getByRole('navigation', { name: 'Hızlı erişim' });
    await expect(tabs).toBeVisible();
    await tabs.getByRole('button', { name: 'Menü' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Kullanıcılar')).toBeVisible();
    await ctx.close();
  });
});
