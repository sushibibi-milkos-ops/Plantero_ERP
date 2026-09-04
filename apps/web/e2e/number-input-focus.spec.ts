import { expect, test, type Page } from '@playwright/test';
import { loginAs } from './fixtures/auth';

/**
 * Ortak `NumberInput` odak yarışı regresyonu (tur 14 P0 kök nedeni):
 * odaklanınca 4 ondalıklı `value` ("3799.9998") ekrana yazılıp seçim kaldırılıyor, ardından
 * TUŞLARLA yazılan metin eskisinin sonuna ekleniyordu ("3799,99981.020,00" → parse null).
 * Burada bilerek `fill()` DEĞİL `click()` + `keyboard.type()` kullanılır — `fill` tümünü kendisi
 * seçtiği için yarışı gizler.
 */
test.describe.configure({ mode: 'serial' });

async function comboboxSelect(page: Page, triggerText: string, search: string, optionMatch: string | RegExp) {
  await page.getByRole('combobox').filter({ hasText: triggerText }).first().click();
  await page.getByPlaceholder('Ara…').fill(search);
  await page.getByRole('option', { name: optionMatch }).first().click();
  await expect(page.getByPlaceholder('Ara…')).toHaveCount(0);
}

test('/depo/mal-kabul/yeni — Birim maliyet: odak + "1.020,00" yazma → 1.020,00 (sona eklenmez)', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/depo/mal-kabul/yeni');
  await expect(page.getByRole('heading', { name: 'Yeni Mal Kabul' })).toBeVisible();
  await comboboxSelect(page, 'Tedarikçi seçin', 'Anadolu', /Anadolu Kuruyemiş/);
  await comboboxSelect(page, 'Ürün ara ve ekle…', '301060000', /Yulaf/);

  const cost = page.getByLabel('Birim maliyet').first();
  const qty = page.getByLabel(/^Miktar/).first();

  // Önce 4 ondalıklı bir değer bırak: form değeri 919.9999, ekranda 2 ondalık "920,00"
  await cost.fill('919,9999');
  await qty.click();
  await expect(cost).toHaveValue('920,00');

  // Odak: metin görünen hassasiyette kalır ve TAMAMI seçilidir
  await cost.click();
  await expect(cost).toHaveValue('920,00');
  await expect
    .poll(() => cost.evaluate((el) => [(el as HTMLInputElement).selectionStart, (el as HTMLInputElement).selectionEnd]))
    .toEqual([0, '920,00'.length]);

  await page.keyboard.type('1.020,00', { delay: 20 });
  await expect(cost).toHaveValue('1.020,00');
  await qty.click(); // blur → normalize
  await expect(cost).toHaveValue('1.020,00');

  // Miktar (FormQty, 3 ondalık): aynı akış
  await qty.fill('100');
  await cost.click();
  await expect(qty).toHaveValue('100');
  await qty.click();
  await expect(qty).toHaveValue('100');
  await page.keyboard.type('12,5', { delay: 20 });
  await expect(qty).toHaveValue('12,5');
  await cost.click();
  await expect(qty).toHaveValue('12,5');
});

test('/finans/tahsilat/yeni — Tutar ve satır tahsisi: odak + "1.020,00" yazma → doğru ayrışır', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/finans/tahsilat/yeni');
  await expect(page).toHaveURL(/tahsilat\/yeni/);
  await comboboxSelect(page, 'Cari seçin…', 'Migros', /Migros/);

  // Ana tutar (FormMoney)
  const amount = page.getByLabel(/^Tutar/).first();
  const reference = page.getByLabel(/Referans/).first();
  await amount.click();
  await page.keyboard.type('1.020,00', { delay: 20 });
  await expect(amount).toHaveValue('1.020,00');
  await reference.click();
  await expect(amount).toHaveValue('1.020,00');

  // Satır tahsisi: checkbox → kalan (3799.9998, ekranda 3.800,00) otomatik dolar; odak + yazma
  const rowCheckbox = page.getByRole('checkbox', { name: /tahsis et$/ }).first();
  await rowCheckbox.click();
  const alloc = page.getByLabel(/için tahsis edilecek para miktarı/).first();
  await expect(alloc).toBeEnabled();
  const before = await alloc.inputValue();
  expect(before).toMatch(/^\d{1,3}(\.\d{3})*,\d{2}$/);

  await alloc.click();
  // Odakta 4 ondalık ("3799,9998") DEĞİL, görünen 2 ondalık ve tümü seçili
  await expect(alloc).toHaveValue(before.replace(/\./g, ''));
  await expect
    .poll(() => alloc.evaluate((el) => (el as HTMLInputElement).selectionEnd! - (el as HTMLInputElement).selectionStart!))
    .toBe(before.replace(/\./g, '').length);

  await page.keyboard.type('1.020,00', { delay: 20 });
  await expect(alloc).toHaveValue('1.020,00');
  await reference.click();
  await expect(alloc).toHaveValue('1.020,00');
  // Tahsis toplamı özetinde de 1.020,00 (değer sessizce düşmedi)
  await expect(page.getByText(/1\.020,00/).first()).toBeVisible();
});
