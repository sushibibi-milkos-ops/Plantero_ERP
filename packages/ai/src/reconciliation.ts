import { D, min as minDecimal, round2 } from '@plantero/core';
import { getClient, structuredComplete } from './client.js';

/**
 * Banka mutabakat ajanı: bir banka hareketini açık faturalar, cariler, kredi taksitleri ve
 * öğrenilmiş desenlerle eşleştirir. `ANTHROPIC_API_KEY` yoksa (veya AI hata verirse) daima
 * kural tabanlı motora (`ruleBasedMatch`) düşer — bu motor testlidir ve tek başına yeterlidir.
 */

export type ReconInvoiceCandidate = {
  id: string;
  docNo: string;
  partnerId: string;
  partnerName: string;
  residual: string;
  dueDate: string;
  kind: 'sales' | 'purchase';
};

export type ReconPartnerCandidate = { id: string; name: string; iban?: string | null };

export type ReconLoanInstallmentCandidate = { id: string; loanId: string; loanCode: string; dueDate: string; installment: string };

export type ReconLearning = {
  pattern: string;
  patternKind: 'description' | 'iban' | 'counterparty';
  partnerId?: string | null;
  expenseAccountCode?: string | null;
  matchKind: string;
  hits: number;
};

export type ReconCandidates = {
  invoices: ReconInvoiceCandidate[];
  partners: ReconPartnerCandidate[];
  loanInstallments: ReconLoanInstallmentCandidate[];
  learnings: ReconLearning[];
};

export type ReconBankTx = {
  id: string;
  description: string;
  amount: string; // + giriş / − çıkış
  counterpartyName?: string | null;
  counterpartyIban?: string | null;
  txDate: string;
  txType?: string | null;
};

export type ReconMatchKind = 'invoice' | 'partner_on_account' | 'loan_installment' | 'expense' | 'transfer' | 'marketplace_payout' | 'tax' | 'fee' | 'unknown';

export type ReconMatch = {
  kind: ReconMatchKind;
  partnerId?: string;
  invoiceIds: string[];
  allocations: { invoiceId: string; amount: string }[];
  loanInstallmentId?: string;
  expenseAccountCode?: string;
  confidence: number; // 0-1
  rationale: string;
  features: Record<string, unknown>;
  source: 'rule' | 'learned' | 'ai';
};

/* ------------------------------------------------------------------ */
/* Metin benzerliği (trigram / Dice katsayısı)                         */
/* ------------------------------------------------------------------ */

const COMPANY_SUFFIXES = /\b(A\.?\s?Ş\.?|LTD\.?|ŞTİ\.?|TİC\.?|SAN\.?|PAZ\.?|VE|SANAYİ|TİCARET|LİMİTED|ŞİRKETİ)\b/g;

function normalizeText(s: string): string {
  return s
    .toLocaleUpperCase('tr')
    .replace(/İ/g, 'I')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

/** İki metin arasındaki Dice trigram benzerliği (0-1) */
export function textSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  const ga = trigrams(na);
  const gb = trigrams(nb);
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

/* ------------------------------------------------------------------ */
/* Kural tabanlı motor (fallback — zorunlu)                            */
/* ------------------------------------------------------------------ */

const DOC_NO_PATTERN = /\b(INV|PINV|SO|PO)-\d{4}-\d{6}\b/g;

function extractDocNoCandidates(text: string): string[] {
  return Array.from(text.toUpperCase().matchAll(DOC_NO_PATTERN)).map((m) => m[0]);
}

function isFeeLike(description: string): boolean {
  return /masraf|ücret|komisyon|bsmv|hesap işletim|kesinti|ekstre/i.test(description);
}

function daysBetween(isoA: string, isoB: string): number {
  return Math.round(Math.abs(new Date(isoA).getTime() - new Date(isoB).getTime()) / 86_400_000);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function findLearning(tx: ReconBankTx, learnings: ReconLearning[]): ReconLearning | null {
  if (tx.counterpartyIban) {
    const ibanHit = learnings.find((l) => l.patternKind === 'iban' && l.pattern === tx.counterpartyIban);
    if (ibanHit) return ibanHit;
  }
  const haystack = `${tx.description} ${tx.counterpartyName ?? ''}`.toLocaleUpperCase('tr');
  const descHits = learnings
    .filter((l) => l.patternKind === 'description' || l.patternKind === 'counterparty')
    .filter((l) => haystack.includes(l.pattern.toLocaleUpperCase('tr')))
    .sort((a, b) => b.hits - a.hits);
  return descHits[0] ?? null;
}

function bestPartnerBySimilarity(tx: ReconBankTx, partners: ReconPartnerCandidate[]): { partner: ReconPartnerCandidate; sim: number } | null {
  const needle = tx.counterpartyName ?? tx.description;
  let best: { partner: ReconPartnerCandidate; sim: number } | null = null;
  for (const p of partners) {
    const sim = textSimilarity(needle, p.name);
    if (!best || sim > best.sim) best = { partner: p, sim };
  }
  return best;
}

function dedupeAndSort(matches: ReconMatch[]): ReconMatch[] {
  const sorted = [...matches].sort((a, b) => b.confidence - a.confidence);
  return sorted.slice(0, 5);
}

/**
 * Kural tabanlı eşleştirme (zorunlu fallback): tutar tam eşleşme, fatura no / cari adı
 * trigram benzerliği, IBAN/açıklama deseni öğrenmesi, kredi taksiti tutar+tarih yakınlığı,
 * banka masrafı deseni.
 */
export function ruleBasedMatch(tx: ReconBankTx, candidates: ReconCandidates): ReconMatch[] {
  const amount = D(tx.amount);
  const absAmount = amount.abs();
  const isInbound = amount.gt(0);
  const results: ReconMatch[] = [];

  const docNoInDesc = extractDocNoCandidates(`${tx.description} ${tx.counterpartyName ?? ''}`);
  const kindWanted: 'sales' | 'purchase' = isInbound ? 'sales' : 'purchase';

  // 1) Açık faturalarda tam tutar eşleşmesi
  const exactAmountInvoices = candidates.invoices.filter((inv) => inv.kind === kindWanted && D(inv.residual).eq(absAmount));
  for (const inv of exactAmountInvoices) {
    const nameSim = textSimilarity(tx.counterpartyName ?? tx.description, inv.partnerName);
    const docHit = docNoInDesc.includes(inv.docNo);
    const confidence = Math.min(0.55 + nameSim * 0.3 + (docHit ? 0.25 : 0), 0.99);
    results.push({
      kind: 'invoice',
      partnerId: inv.partnerId,
      invoiceIds: [inv.id],
      allocations: [{ invoiceId: inv.id, amount: absAmount.toFixed(4) }],
      confidence: round(confidence),
      rationale: `Tutar tam eşleşme (${inv.docNo}) + isim benzerliği %${Math.round(nameSim * 100)}${docHit ? ' + fatura no açıklamada geçiyor' : ''}`,
      features: { nameSim, docHit, amountExact: true },
      source: 'rule',
    });
  }

  // 2) Fatura no açıklamada geçiyor ama tutar tam eşleşmiyor (kısmi/fazla ödeme)
  for (const docNo of docNoInDesc) {
    const inv = candidates.invoices.find((i) => i.docNo === docNo);
    if (inv && !exactAmountInvoices.some((e) => e.id === inv.id)) {
      const alloc = minDecimal(absAmount, D(inv.residual));
      results.push({
        kind: 'invoice',
        partnerId: inv.partnerId,
        invoiceIds: [inv.id],
        allocations: [{ invoiceId: inv.id, amount: round2(alloc).toFixed(4) }],
        confidence: 0.7,
        rationale: `Fatura no (${inv.docNo}) açıklamada geçiyor, tutar tam eşleşmiyor (kısmi/fazla ödeme olabilir)`,
        features: { docHit: true, amountExact: false },
        source: 'rule',
      });
    }
  }

  // 3) Öğrenilmiş desen (IBAN / açıklama)
  const learning = findLearning(tx, candidates.learnings);
  if (learning) {
    if (learning.matchKind === 'expense' && learning.expenseAccountCode) {
      results.push({
        kind: 'expense',
        expenseAccountCode: learning.expenseAccountCode,
        invoiceIds: [],
        allocations: [],
        confidence: round(Math.min(0.6 + learning.hits * 0.03, 0.95)),
        rationale: `Öğrenilmiş desen: "${learning.pattern}" → ${learning.expenseAccountCode} (${learning.hits} kez onaylandı)`,
        features: { learned: true, hits: learning.hits },
        source: 'learned',
      });
    } else if (learning.partnerId) {
      const partner = candidates.partners.find((p) => p.id === learning.partnerId);
      results.push({
        kind: 'partner_on_account',
        partnerId: learning.partnerId,
        invoiceIds: [],
        allocations: [],
        confidence: round(Math.min(0.55 + learning.hits * 0.03, 0.93)),
        rationale: `Öğrenilmiş desen: "${learning.pattern}" → ${partner?.name ?? learning.partnerId} (${learning.hits} kez onaylandı)`,
        features: { learned: true, hits: learning.hits },
        source: 'learned',
      });
    }
  }

  // 4) Kredi taksiti: tutar tam eşleşme + tarih yakınlığı (±5 gün)
  for (const inst of candidates.loanInstallments) {
    if (D(inst.installment).eq(absAmount)) {
      const dayDiff = daysBetween(inst.dueDate, tx.txDate);
      if (dayDiff <= 5) {
        const confidence = dayDiff === 0 ? 0.95 : Math.max(0.7, 0.95 - dayDiff * 0.04);
        results.push({
          kind: 'loan_installment',
          loanInstallmentId: inst.id,
          invoiceIds: [],
          allocations: [],
          confidence: round(confidence),
          rationale: `Kredi taksiti tutarı tam eşleşiyor (${inst.loanCode}), vade farkı ${dayDiff} gün`,
          features: { dayDiff, amountExact: true },
          source: 'rule',
        });
      }
    }
  }

  // 5) Banka masrafı deseni
  if (!isInbound && isFeeLike(tx.description) && absAmount.lte(5000)) {
    results.push({
      kind: 'fee',
      expenseAccountCode: '770',
      invoiceIds: [],
      allocations: [],
      confidence: 0.85,
      rationale: 'Açıklama banka masrafı/komisyon deseniyle eşleşiyor',
      features: { feePattern: true },
      source: 'rule',
    });
  }

  // 6) İsim benzerliği (tutar tam eşleşmese de) → cari bakiyesine
  const bestPartner = bestPartnerBySimilarity(tx, candidates.partners);
  if (bestPartner && bestPartner.sim >= 0.5 && !results.some((r) => r.partnerId === bestPartner.partner.id)) {
    results.push({
      kind: 'partner_on_account',
      partnerId: bestPartner.partner.id,
      invoiceIds: [],
      allocations: [],
      confidence: round(0.3 + bestPartner.sim * 0.4),
      rationale: `İsim benzerliği %${Math.round(bestPartner.sim * 100)}: ${bestPartner.partner.name}`,
      features: { nameSim: bestPartner.sim },
      source: 'rule',
    });
  }

  if (results.length === 0) {
    results.push({
      kind: 'unknown',
      invoiceIds: [],
      allocations: [],
      confidence: 0,
      rationale: 'Kural motoru güvenilir bir eşleşme bulamadı; manuel inceleme gerekli',
      features: {},
      source: 'rule',
    });
  }

  return dedupeAndSort(results);
}

/** Otomatik uygulama kuralı: ≥0.92 ve tek (belirsizliksiz) aday varsa true */
export function isAutoApplicable(matches: ReconMatch[]): boolean {
  const strong = matches.filter((m) => m.confidence >= 0.92);
  return strong.length === 1;
}

/* ------------------------------------------------------------------ */
/* AI destekli (opsiyonel) — istemci yoksa/başarısızsa kural motoruna düşer */
/* ------------------------------------------------------------------ */

async function tryAiMatch(tx: ReconBankTx, candidates: ReconCandidates): Promise<ReconMatch[] | null> {
  const result = await structuredComplete<{ matches: ReconMatch[] }>({
    system:
      'Sen Plantero ERP için banka mutabakat asistanısın. Verilen banka hareketini aday faturalar, cariler, ' +
      'kredi taksitleri ve öğrenilmiş desenlerle eşleştir. Yalnızca verilen adaylardan seç, uydurma id kullanma.',
    prompt: JSON.stringify({ transaction: tx, candidates }),
    toolName: 'report_matches',
    toolDescription: 'Banka hareketi için en olası eşleşme adaylarını güven puanıyla birlikte döner',
    inputSchema: {
      type: 'object',
      properties: {
        matches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['invoice', 'partner_on_account', 'loan_installment', 'expense', 'transfer', 'marketplace_payout', 'tax', 'fee', 'unknown'] },
              partnerId: { type: 'string' },
              invoiceIds: { type: 'array', items: { type: 'string' } },
              allocations: { type: 'array', items: { type: 'object', properties: { invoiceId: { type: 'string' }, amount: { type: 'string' } }, required: ['invoiceId', 'amount'] } },
              loanInstallmentId: { type: 'string' },
              expenseAccountCode: { type: 'string' },
              confidence: { type: 'number' },
              rationale: { type: 'string' },
            },
            required: ['kind', 'invoiceIds', 'allocations', 'confidence', 'rationale'],
          },
        },
      },
      required: ['matches'],
    },
  });
  if (!result?.matches?.length) return null;
  return result.matches.map((m) => ({ ...m, features: { ai: true }, source: 'ai' as const }));
}

/**
 * Ana giriş noktası: AI varsa dener, yoksa/başarısızsa (veya boş dönerse) kural motoruna düşer.
 * Kural motoru (`ruleBasedMatch`) her zaman hesaplanır ve AI sonuçlarıyla birleştirilir.
 */
export async function matchBankTransaction(tx: ReconBankTx, candidates: ReconCandidates): Promise<ReconMatch[]> {
  const ruleMatches = ruleBasedMatch(tx, candidates);
  if (!getClient()) return ruleMatches;

  const aiMatches = await tryAiMatch(tx, candidates);
  if (!aiMatches || aiMatches.length === 0) return ruleMatches;
  return dedupeAndSort([...aiMatches, ...ruleMatches]);
}
