import { chromium } from 'playwright-core';

export type PdfMargin = { top?: string; bottom?: string; left?: string; right?: string };
export type RenderPdfOptions = { format?: 'A4' | 'A5'; landscape?: boolean; margin?: PdfMargin };

/**
 * HTML string'i A4 PDF'e çevirir (Playwright chromium, `PLAYWRIGHT_BROWSERS_PATH` altındaki
 * yüklü tarayıcıyı kullanır). Her çağrı kendi tarayıcı örneğini açıp kapatır — kısa ömürlü,
 * eşzamanlı belge üretimi (satın alma siparişi, proforma, irsaliye) için uygundur.
 */
export async function renderPdf(html: string, options: RenderPdfOptions = {}): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: options.format ?? 'A4',
      landscape: options.landscape ?? false,
      printBackground: true,
      margin: options.margin ?? { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
