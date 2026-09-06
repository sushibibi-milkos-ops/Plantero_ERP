import { test, expect } from '@playwright/test';
import { loginAs } from './fixtures/auth';

/**
 * Akış: admin → /ayarlar/roller'da yeni bir rol oluşturur, izin matrisinden bir hücre işaretleyip
 * kaydeder → /ayarlar/audit'te bu değişikliğin satırı görünür ve satır tıklanınca diff sheet'i
 * yeni izni gösterir. Negatif: depo rolü her iki sayfada da 403'e düşer.
 *
 * Test verisi: mevcut rollere DOKUNMAZ (sözleşme #2 — yalnızca kendi modülünün yazdığı yeni bir
 * rol oluşturur), diğer e2e akışlarını etkilemez. Benzersizlik zaman damgalı `RUN` etiketiyle.
 */
const RUN = Date.now().toString(36);

test.describe('Ayarlar — Roller ve Denetim Kaydı', () => {
  test('admin: yeni rol oluştur → izin matrisinden kaydet → denetim kaydında görünür', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/ayarlar/roller');
    await expect(page.getByRole('heading', { level: 1, name: 'Roller ve İzinler' })).toBeVisible();

    const roleName = `QA Rol ${RUN}`;
    await page.getByRole('button', { name: 'Yeni Rol' }).click();
    await expect(page.getByRole('dialog', { name: 'Yeni rol oluştur' })).toBeVisible();
    await page.getByLabel('Rol adı').fill(roleName);
    // Kod otomatik türetilir (normalizeCode) — elle dokunulmuyor
    await expect(page.getByLabel('Rol kodu')).not.toHaveValue('');
    await page.getByRole('button', { name: 'Oluştur' }).click();
    await expect(page.getByText('Rol oluşturuldu')).toBeVisible();
    await page.waitForURL(/\/ayarlar\/roller\?role=[0-9a-f-]{8}-/);

    // Yeni oluşan rol seçili ve başlangıçta hiçbir izni yok
    await expect(page.getByRole('heading', { level: 2, name: roleName })).toBeVisible();
    await expect(page.getByText('0 izin')).toBeVisible();

    // İzin matrisi: Depo modülü satırında ilk sütun (Görüntüle → stock.view) işaretlenir
    const row = page.locator('tr', { has: page.locator('th', { hasText: 'Depo' }) });
    const cb = row.locator('td').first().locator('button[role="checkbox"]');
    await expect(cb).toHaveAttribute('data-state', 'unchecked');
    const saveBtn = page.getByRole('button', { name: 'Kaydet' });
    await expect(saveBtn).toBeDisabled();
    await cb.click();
    await expect(cb).toHaveAttribute('data-state', 'checked');
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await expect(page.getByText(/İzinler kaydedildi/)).toBeVisible();

    // Denetim kaydı: role_permissions tablosuna filtrelenince yeni satır görünür
    await page.goto('/ayarlar/audit?table=role_permissions');
    await expect(page.getByRole('heading', { level: 1, name: 'Denetim Kaydı' })).toBeVisible();
    const auditRow = page.locator('table tbody tr').first();
    await expect(auditRow).toBeVisible();

    // Satıra tıklayınca önce/sonra diff sheet'i açılır ve yeni izni gösterir
    await auditRow.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('stock.view')).toBeVisible();
  });

  test('depo: /ayarlar/roller ve /ayarlar/audit sayfalarında engellenir', async ({ page }) => {
    await loginAs(page, 'depo', '/ayarlar/roller');
    await expect(page).toHaveURL(/\/ayarlar\/roller/);
    await expect(page.getByText('Bu sayfa için yetkiniz yok')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Roller ve İzinler' })).not.toBeVisible();

    await page.goto('/ayarlar/audit');
    await expect(page.getByText('Bu sayfa için yetkiniz yok')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Denetim Kaydı' })).not.toBeVisible();

    // Ayarlar grubu depo kullanıcısının kenar çubuğunda hiç görünmez (grup izni yok)
    const nav = page.getByRole('navigation', { name: 'Ana menü' });
    await expect(nav.getByText('Ayarlar')).not.toBeVisible();
  });
});
