/**
 * Sade, A4, Türkçe PDF şablonları (satın alma siparişi, proforma, çeki listesi).
 * `renderPdf` ile birlikte kullanılır; harici CSS çerçevesi yok, gömülü stil.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMoneyTr(v: string, currency = 'TRY'): string {
  const n = Number(v);
  const symbol = currency === 'TRY' ? '₺' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `;
  const formatted = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0);
  return `${symbol}${formatted}`;
}

function formatDateTr(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function baseStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Inter, Arial, sans-serif; color: #18181b; font-size: 12px; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .muted { color: #71717a; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 1px solid #e4e4e7; }
    .meta { text-align: right; font-size: 12px; }
    .meta div { margin-bottom: 2px; }
    .parties { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
    .party { flex: 1; }
    .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #71717a; margin: 0 0 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; color: #71717a; padding: 6px 8px; border-bottom: 1px solid #d4d4d8; }
    td { padding: 7px 8px; border-bottom: 1px solid #f4f4f5; font-size: 12px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .totals { width: 260px; margin-left: auto; }
    .totals td { border: none; padding: 4px 8px; }
    .totals .grand td { border-top: 1px solid #d4d4d8; font-weight: 600; padding-top: 8px; }
    .footer { margin-top: 28px; font-size: 11px; color: #71717a; }
  `;
}

export type PoDocLine = { description: string; qty: string; uom: string; unitPrice: string; lineTotal: string };
export type PurchaseOrderHtmlInput = {
  docNo: string;
  orderDate: string;
  expectedDate?: string;
  supplierName: string;
  supplierAddress?: string;
  supplierTaxNumber?: string;
  buyerName?: string;
  warehouseName: string;
  lines: PoDocLine[];
  subtotal: string;
  vatTotal: string;
  grandTotal: string;
  currency: string;
  note?: string;
};

export function purchaseOrderHtml(input: PurchaseOrderHtmlInput): string {
  const rows = input.lines
    .map(
      (l) => `<tr>
        <td>${escapeHtml(l.description)}</td>
        <td class="num">${escapeHtml(l.qty)} ${escapeHtml(l.uom)}</td>
        <td class="num">${formatMoneyTr(l.unitPrice, input.currency)}</td>
        <td class="num">${formatMoneyTr(l.lineTotal, input.currency)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8" /><style>${baseStyles()}</style></head><body>
    <div class="header">
      <div><h1>Plantero — Satın Alma Siparişi</h1><div class="muted">Bigetaş Biyoteknoloji A.Ş.</div></div>
      <div class="meta">
        <div><strong>${escapeHtml(input.docNo)}</strong></div>
        <div>Sipariş Tarihi: ${formatDateTr(input.orderDate)}</div>
        ${input.expectedDate ? `<div>Beklenen Teslim: ${formatDateTr(input.expectedDate)}</div>` : ''}
      </div>
    </div>
    <div class="parties">
      <div class="party">
        <h3>Tedarikçi</h3>
        <div>${escapeHtml(input.supplierName)}</div>
        ${input.supplierAddress ? `<div class="muted">${escapeHtml(input.supplierAddress)}</div>` : ''}
        ${input.supplierTaxNumber ? `<div class="muted">VKN: ${escapeHtml(input.supplierTaxNumber)}</div>` : ''}
      </div>
      <div class="party">
        <h3>Teslimat</h3>
        <div>${escapeHtml(input.warehouseName)}</div>
        ${input.buyerName ? `<div class="muted">Satın Alma Sorumlusu: ${escapeHtml(input.buyerName)}</div>` : ''}
      </div>
    </div>
    <table>
      <thead><tr><th>Ürün</th><th class="num">Miktar</th><th class="num">Birim Fiyat</th><th class="num">Tutar</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tbody>
        <tr><td>Ara Toplam</td><td class="num">${formatMoneyTr(input.subtotal, input.currency)}</td></tr>
        <tr><td>KDV</td><td class="num">${formatMoneyTr(input.vatTotal, input.currency)}</td></tr>
        <tr class="grand"><td>Genel Toplam</td><td class="num">${formatMoneyTr(input.grandTotal, input.currency)}</td></tr>
      </tbody>
    </table>
    ${input.note ? `<div class="footer">${escapeHtml(input.note)}</div>` : ''}
  </body></html>`;
}

export type ProformaHtmlInput = {
  docNo: string;
  quoteDate: string;
  validUntil?: string;
  customerName: string;
  customerAddress?: string;
  customerTaxNumber?: string;
  lines: PoDocLine[];
  subtotal: string;
  vatTotal: string;
  grandTotal: string;
  currency: string;
  note?: string;
};

export function proformaHtml(input: ProformaHtmlInput): string {
  const rows = input.lines
    .map(
      (l) => `<tr>
        <td>${escapeHtml(l.description)}</td>
        <td class="num">${escapeHtml(l.qty)} ${escapeHtml(l.uom)}</td>
        <td class="num">${formatMoneyTr(l.unitPrice, input.currency)}</td>
        <td class="num">${formatMoneyTr(l.lineTotal, input.currency)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8" /><style>${baseStyles()}</style></head><body>
    <div class="header">
      <div><h1>Plantero — Proforma Fatura</h1><div class="muted">Bigetaş Biyoteknoloji A.Ş.</div></div>
      <div class="meta">
        <div><strong>${escapeHtml(input.docNo)}</strong></div>
        <div>Teklif Tarihi: ${formatDateTr(input.quoteDate)}</div>
        ${input.validUntil ? `<div>Geçerlilik: ${formatDateTr(input.validUntil)}</div>` : ''}
      </div>
    </div>
    <div class="parties">
      <div class="party">
        <h3>Müşteri</h3>
        <div>${escapeHtml(input.customerName)}</div>
        ${input.customerAddress ? `<div class="muted">${escapeHtml(input.customerAddress)}</div>` : ''}
        ${input.customerTaxNumber ? `<div class="muted">VKN: ${escapeHtml(input.customerTaxNumber)}</div>` : ''}
      </div>
    </div>
    <table>
      <thead><tr><th>Ürün</th><th class="num">Miktar</th><th class="num">Birim Fiyat</th><th class="num">Tutar</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tbody>
        <tr><td>Ara Toplam</td><td class="num">${formatMoneyTr(input.subtotal, input.currency)}</td></tr>
        <tr><td>KDV</td><td class="num">${formatMoneyTr(input.vatTotal, input.currency)}</td></tr>
        <tr class="grand"><td>Genel Toplam</td><td class="num">${formatMoneyTr(input.grandTotal, input.currency)}</td></tr>
      </tbody>
    </table>
    ${input.note ? `<div class="footer">${escapeHtml(input.note)}</div>` : ''}
  </body></html>`;
}

export type PackingListLine = { description: string; lotNo?: string; qty: string; uom: string };
export type PackingListHtmlInput = {
  docNo: string;
  shipDate: string;
  customerName: string;
  customerAddress?: string;
  warehouseName: string;
  lines: PackingListLine[];
  note?: string;
};

export function packingListHtml(input: PackingListHtmlInput): string {
  const rows = input.lines
    .map(
      (l) => `<tr>
        <td>${escapeHtml(l.description)}</td>
        <td>${l.lotNo ? escapeHtml(l.lotNo) : '—'}</td>
        <td class="num">${escapeHtml(l.qty)} ${escapeHtml(l.uom)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8" /><style>${baseStyles()}</style></head><body>
    <div class="header">
      <div><h1>Plantero — Çeki Listesi / İrsaliye</h1><div class="muted">Bigetaş Biyoteknoloji A.Ş.</div></div>
      <div class="meta">
        <div><strong>${escapeHtml(input.docNo)}</strong></div>
        <div>Sevk Tarihi: ${formatDateTr(input.shipDate)}</div>
      </div>
    </div>
    <div class="parties">
      <div class="party">
        <h3>Alıcı</h3>
        <div>${escapeHtml(input.customerName)}</div>
        ${input.customerAddress ? `<div class="muted">${escapeHtml(input.customerAddress)}</div>` : ''}
      </div>
      <div class="party">
        <h3>Sevk Deposu</h3>
        <div>${escapeHtml(input.warehouseName)}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Ürün</th><th>Lot No</th><th class="num">Miktar</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${input.note ? `<div class="footer">${escapeHtml(input.note)}</div>` : ''}
  </body></html>`;
}
