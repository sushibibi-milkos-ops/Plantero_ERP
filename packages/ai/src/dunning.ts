import { getClient, structuredComplete } from './client.js';

/**
 * Tahsilat hatırlatma metni üretici. Fallback: 4 seviye/ton Türkçe şablon (zorunlu, testli).
 */

export type DunningInvoice = { docNo: string; grandTotal: string; residual: string; dueDate: string; currency: string };
export type DunningPartner = { name: string; contactName?: string };
export type DunningLevel = 1 | 2 | 3 | 4;
export type DunningTone = 'friendly' | 'firm' | 'formal' | 'legal';
export type DunningDraft = { subject: string; body: string };

function formatMoneyTr(v: string, currency = 'TRY'): string {
  const n = Number(v);
  const symbol = currency === 'TRY' ? '₺' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `;
  return `${symbol}${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0)}`;
}

function formatDateTr(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function daysOverdue(dueDateIso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dueDateIso).getTime()) / 86_400_000));
}

type TemplateFn = (invoice: DunningInvoice, partner: DunningPartner) => DunningDraft;

const FALLBACK_TEMPLATES: Record<DunningLevel, TemplateFn> = {
  1: (i, p) => ({
    subject: `Fatura ${i.docNo} — vade hatırlatması`,
    body:
      `Sayın ${p.name},\n\n${i.docNo} numaralı faturanızın vadesi ${formatDateTr(i.dueDate)} tarihinde dolmaktadır. ` +
      `Kalan tutar: ${formatMoneyTr(i.residual, i.currency)}.\n\nBilginize sunarız.\n\nSaygılarımızla,\nPlantero`,
  }),
  2: (i, p) => ({
    subject: `Fatura ${i.docNo} — vadesi geçti`,
    body:
      `Sayın ${p.name},\n\n${i.docNo} numaralı faturanızın vadesi ${formatDateTr(i.dueDate)} tarihinde dolmuş olup henüz ` +
      `tahsil edilememiştir. Kalan tutar: ${formatMoneyTr(i.residual, i.currency)}.\n\nEn kısa sürede ödeme yapmanızı rica ederiz.\n\n` +
      `Saygılarımızla,\nPlantero`,
  }),
  3: (i, p) => ({
    subject: `ÖNEMLİ: Fatura ${i.docNo} — ödeme bekleniyor`,
    body:
      `Sayın ${p.name},\n\n${i.docNo} numaralı faturanız vadesinden bu yana ${daysOverdue(i.dueDate)} gün geçmiştir. ` +
      `Kalan tutar: ${formatMoneyTr(i.residual, i.currency)}.\n\nÖdemenizin 3 iş günü içinde yapılmasını rica ederiz; aksi halde yeni ` +
      `sipariş teslimatlarımız durdurulacaktır.\n\nSaygılarımızla,\nPlantero`,
  }),
  4: (i, p) => ({
    subject: `İHTARNAME NİTELİĞİNDE UYARI: Fatura ${i.docNo}`,
    body:
      `Sayın ${p.name},\n\n${i.docNo} numaralı faturanıza ait ${formatMoneyTr(i.residual, i.currency)} tutarındaki bakiye, ` +
      `vadesinden bu yana ${daysOverdue(i.dueDate)} gün geçmesine rağmen ödenmemiştir.\n\nBu yazı ihtarname niteliğinde olup, ödemenin ` +
      `7 gün içinde yapılmaması halinde yasal takip başlatılacaktır.\n\nSaygılarımızla,\nPlantero Hukuk ve Tahsilat Birimi`,
  }),
};

/** Kural tabanlı fallback (zorunlu, ton parametresinden bağımsız — seviye tona zaten karşılık gelir) */
export function fallbackDunningMessage(invoice: DunningInvoice, partner: DunningPartner, level: DunningLevel): DunningDraft {
  return FALLBACK_TEMPLATES[level](invoice, partner);
}

async function tryAiDunning(
  invoice: DunningInvoice,
  partner: DunningPartner,
  level: DunningLevel,
  tone: DunningTone | undefined,
  fallback: DunningDraft,
): Promise<DunningDraft | null> {
  const result = await structuredComplete<DunningDraft>({
    system:
      'Sen Plantero ERP için tahsilat hatırlatma metni yazan bir asistansın. Türkçe, kurumsal ve seviyeye uygun tonda ' +
      '(1: nazik hatırlatma, 2: vade geçti, 3: son uyarı, 4: ihtarname niteliğinde) kısa bir e-posta yaz.',
    prompt: JSON.stringify({ invoice, partner, level, tone, fallbackExample: fallback }),
    toolName: 'report_dunning_message',
    toolDescription: 'Tahsilat hatırlatma e-postası konu ve gövdesini döner',
    inputSchema: {
      type: 'object',
      properties: { subject: { type: 'string' }, body: { type: 'string' } },
      required: ['subject', 'body'],
    },
  });
  if (!result?.subject || !result?.body) return null;
  return result;
}

/** Ana giriş noktası: AI varsa dener, yoksa/başarısızsa şablon fallback'e düşer */
export async function draftDunningMessage(invoice: DunningInvoice, partner: DunningPartner, level: DunningLevel, tone?: DunningTone): Promise<DunningDraft> {
  const fallback = fallbackDunningMessage(invoice, partner, level);
  if (!getClient()) return fallback;
  const ai = await tryAiDunning(invoice, partner, level, tone, fallback);
  return ai ?? fallback;
}
