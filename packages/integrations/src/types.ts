/**
 * Entegrasyon adaptörleri için ortak arayüzler.
 * Her adaptör `mode: 'sandbox' | 'live'` taşır — ilgili env değişkeni yoksa 'sandbox'.
 * Sandbox modu deterministik sahte veri üretir (gerçek dış bağlantı yapılmaz).
 */

export type IntegrationMode = 'sandbox' | 'live';

/* ------------------------------------------------------------------ */
/* e-Belge (Bizimhesap)                                                */
/* ------------------------------------------------------------------ */

export type EInvoiceKind = 'e_fatura' | 'e_arsiv' | 'export';

export type EInvoiceLine = {
  description: string;
  qty: string;
  unitPrice: string;
  vatRate: string;
  lineTotal: string;
};

export type EInvoiceInput = {
  kind: EInvoiceKind;
  docNo: string;
  partnerName: string;
  partnerTaxNumber?: string;
  partnerTaxOffice?: string;
  invoiceDate: string; // ISO tarih (YYYY-MM-DD)
  currency: string;
  lines: EInvoiceLine[];
  subtotal: string;
  vatTotal: string;
  grandTotal: string;
  note?: string;
};

export type EInvoiceSendStatus = 'accepted' | 'queued' | 'rejected' | 'error';

export type EInvoiceResult = {
  ok: boolean;
  uuid: string;
  ettn?: string;
  status: EInvoiceSendStatus;
  providerRef?: string;
  error?: string;
  sandbox: boolean;
};

export type DespatchLine = { description: string; qty: string };

export type DespatchInput = {
  docNo: string;
  partnerName: string;
  despatchDate: string;
  lines: DespatchLine[];
};

export type DespatchResult = {
  ok: boolean;
  uuid: string;
  status: EInvoiceSendStatus;
  sandbox: boolean;
  error?: string;
};

export interface EInvoiceProvider {
  readonly mode: IntegrationMode;
  sendInvoice(input: EInvoiceInput): Promise<EInvoiceResult>;
  sendDespatch(input: DespatchInput): Promise<DespatchResult>;
  getStatus(uuid: string): Promise<{ status: string; sandbox: boolean }>;
}

/* ------------------------------------------------------------------ */
/* Pazaryeri (Trendyol / Hepsiburada)                                   */
/* ------------------------------------------------------------------ */

export type MarketplaceOrderLine = {
  barcode: string;
  sku?: string;
  productName: string;
  qty: string;
  unitPrice: string;
};

export type MarketplaceOrder = {
  externalId: string;
  orderedAt: string; // ISO datetime
  externalStatus: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  grossAmount: string;
  commissionAmount: string;
  shippingAmount: string;
  netAmount: string;
  currency: string;
  lines: MarketplaceOrderLine[];
  raw: Record<string, unknown>;
};

export type SettlementPeriod = { periodStart: string; periodEnd: string };

export type MarketplaceSettlement = {
  periodStart: string;
  periodEnd: string;
  grossSales: string;
  commissions: string;
  shippingDeductions: string;
  otherDeductions: string;
  returns: string;
  netPayout: string;
  expectedPayoutDate: string;
};

export type StockUpdateItem = { barcode: string; qty: string };

export interface MarketplaceProvider {
  readonly mode: IntegrationMode;
  readonly channelCode: 'TRENDYOL' | 'HEPSIBURADA';
  fetchOrders(since: Date): Promise<MarketplaceOrder[]>;
  updateStock(items: StockUpdateItem[]): Promise<{ ok: boolean; updated: number; sandbox: boolean }>;
  fetchSettlements(period: SettlementPeriod): Promise<MarketplaceSettlement[]>;
}

/* ------------------------------------------------------------------ */
/* Banka                                                                */
/* ------------------------------------------------------------------ */

export type BankTx = {
  externalRef: string;
  txDate: string; // ISO tarih
  valueDate?: string;
  amount: string; // + giriş / − çıkış, numeric(18,4) uyumlu string
  currency: string;
  balanceAfter?: string;
  description: string;
  counterpartyName?: string;
  counterpartyIban?: string;
  txType?: string;
  raw?: Record<string, unknown>;
};

export interface BankProvider {
  readonly mode: IntegrationMode;
  fetchTransactions(account: { code: string; iban?: string; accountNo?: string }, since: Date): Promise<BankTx[]>;
}

export type Mt940Balance = { mark: 'D' | 'C'; amount: string; date: string; currency: string };

export type Mt940ParseResult = {
  statementRef: string;
  accountIban: string;
  statementNo?: string;
  openingBalance: Mt940Balance;
  closingBalance: Mt940Balance;
  transactions: BankTx[];
};

export type CsvColumnMapping = {
  delimiter?: string;
  hasHeader?: boolean;
  dateColumn?: string;
  descriptionColumn?: string;
  amountColumn?: string;
  balanceColumn?: string;
  dateFormat?: 'DD.MM.YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  decimalSeparator?: ',' | '.';
};

/* ------------------------------------------------------------------ */
/* Kur (TCMB)                                                          */
/* ------------------------------------------------------------------ */

export type DailyRate = { currency: string; buying: string; selling: string };

export interface RateProvider {
  readonly mode: IntegrationMode;
  fetchDaily(date: Date): Promise<DailyRate[]>;
}

/* ------------------------------------------------------------------ */
/* Mesajlaşma (WhatsApp / e-posta)                                     */
/* ------------------------------------------------------------------ */

export type WhatsAppInput = { to: string; body: string; templateName?: string };

export type EmailAttachment = { filename: string; content: Buffer; contentType?: string };

export type EmailInput = { to: string; subject: string; body: string; html?: string; attachments?: EmailAttachment[] };

export type MessageResult = { ok: boolean; providerId: string; sandbox: boolean; error?: string };

export interface WhatsAppMessenger {
  readonly mode: IntegrationMode;
  sendWhatsApp(input: WhatsAppInput): Promise<MessageResult>;
}

export interface EmailMessenger {
  readonly mode: IntegrationMode;
  sendEmail(input: EmailInput): Promise<MessageResult>;
}

/* ------------------------------------------------------------------ */
/* Durum özeti                                                         */
/* ------------------------------------------------------------------ */

export type IntegrationStatus = {
  einvoice: IntegrationMode;
  trendyol: IntegrationMode;
  hepsiburada: IntegrationMode;
  bank: IntegrationMode;
  tcmb: IntegrationMode;
  whatsapp: IntegrationMode;
  email: IntegrationMode;
};
