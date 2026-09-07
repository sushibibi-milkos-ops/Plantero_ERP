import { and, eq, inArray } from 'drizzle-orm';
import type Decimal from 'decimal.js';
import { documentLinks, documentIndex, partners, type DbOrTx } from '@plantero/db';
import { toDb } from '../money.js';
import type { ActorCtx, DocumentOrigin, DocumentType } from '../types.js';

export type LinkInput = {
  sourceType: DocumentType;
  sourceId: string;
  sourceLineId?: string | null;
  targetType: DocumentType;
  targetId: string;
  targetLineId?: string | null;
  qty?: Decimal | null;
  amount?: Decimal | null;
};

export type ChainNode = {
  type: DocumentType;
  id: string;
  docNo: string;
  status: string | null;
  date: Date | null;
  amount: string | null;
  partnerName: string | null;
  partnerId: string | null;
  title: string | null;
  /** Kök belgeden uzaklık (1 = doğrudan bağlı) */
  depth: number;
};

export type ChainLink = { sourceType: DocumentType; sourceId: string; targetType: DocumentType; targetId: string; qty: string | null; amount: string | null; sourceLineId: string | null; targetLineId: string | null };

/** Kaynak → hedef belge bağı. Aynı bağ (satır dahil) varsa tekrar oluşturulmaz. */
export async function linkDocuments(tx: DbOrTx, input: LinkInput, ctx: ActorCtx): Promise<{ id: string; created: boolean }> {
  if (input.sourceType === input.targetType && input.sourceId === input.targetId) throw new Error('Belge kendine bağlanamaz');
  const conds = [
    eq(documentLinks.sourceType, input.sourceType),
    eq(documentLinks.sourceId, input.sourceId),
    eq(documentLinks.targetType, input.targetType),
    eq(documentLinks.targetId, input.targetId),
  ];
  const existing = await tx.select({ id: documentLinks.id, sourceLineId: documentLinks.sourceLineId, targetLineId: documentLinks.targetLineId }).from(documentLinks).where(and(...conds));
  const same = existing.find((e) => (e.sourceLineId ?? null) === (input.sourceLineId ?? null) && (e.targetLineId ?? null) === (input.targetLineId ?? null));
  if (same) {
    if (input.qty !== undefined || input.amount !== undefined) {
      await tx.update(documentLinks).set({ qty: input.qty ? toDb(input.qty) : null, amount: input.amount ? toDb(input.amount) : null }).where(eq(documentLinks.id, same.id));
    }
    return { id: same.id, created: false };
  }
  const [row] = await tx
    .insert(documentLinks)
    .values({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceLineId: input.sourceLineId ?? null,
      targetType: input.targetType,
      targetId: input.targetId,
      targetLineId: input.targetLineId ?? null,
      qty: input.qty ? toDb(input.qty) : null,
      amount: input.amount ? toDb(input.amount) : null,
      createdBy: ctx.userId ?? null,
    })
    .returning({ id: documentLinks.id });
  return { id: row!.id, created: true };
}

export type IndexInput = {
  type: DocumentType;
  recordId: string;
  docNo: string;
  partnerId?: string | null;
  status?: string | null;
  origin?: DocumentOrigin;
  title?: string | null;
  amount?: Decimal | string | number | null;
  docDate?: Date | null;
};

/** document_index upsert — her belge oluşturma/durum değişiminde çağrılır (ON CONFLICT (type, record_id) DO UPDATE) */
export async function indexDocument(tx: DbOrTx, input: IndexInput): Promise<{ id: string }> {
  const values = {
    docNo: input.docNo,
    partnerId: input.partnerId ?? null,
    status: input.status ?? null,
    origin: input.origin ?? 'chain',
    title: input.title ?? null,
    amount: input.amount === undefined || input.amount === null ? null : toDb(input.amount),
    docDate: input.docDate ?? new Date(),
    updatedAt: new Date(),
  };
  const [row] = await tx
    .insert(documentIndex)
    .values({ type: input.type, recordId: input.recordId, ...values })
    .onConflictDoUpdate({ target: [documentIndex.type, documentIndex.recordId], set: values })
    .returning({ id: documentIndex.id });
  return { id: row!.id };
}

type Key = `${string}:${string}`;
const key = (type: string, id: string): Key => `${type}:${id}`;

/**
 * Kanonik belge zinciri rankı (CLAUDE.md kural 3: teklif → sipariş → irsaliye → fatura → tahsilat).
 * Aynı derinlikteki (depth) düğümler arasındaki sırayı belirler — depth tek başına yeterli değil:
 * bir belgeye AYNI ANDA iki farklı belge doğrudan bağlanmış olabilir (ör. hem sipariş hem irsaliye,
 * ikisi de ihracat sevkiyatına depth=1'de bağlı). Eskiden bu durumda document_index.doc_date (seed/
 * oluşturma zaman damgası, birkaç ms fark) sırayı belirliyordu — bu zaman damgası belge zincirinin
 * GERÇEK yönünü yansıtmaz (ör. irsaliye kaydı sipariş kaydından önce insert edilmiş olabilir), bu
 * yüzden aynı topolojiye sahip iki kayıt ekranda farklı (biri düz, biri ters) sırada render
 * ediliyordu (Tur 15c, EXP-2026-000001 vs EXP-2026-000002).
 */
const TYPE_RANK: Record<string, number> = {
  opportunity: 0,
  quotation: 1,
  purchase_order: 2,
  sales_order: 2,
  work_order: 3,
  receipt: 4,
  delivery: 4,
  transfer: 4,
  stock_count: 4,
  scrap: 4,
  quality_check: 5,
  export_shipment: 6,
  proforma: 6,
  packing_list: 6,
  invoice: 7,
  credit_note: 7,
  recall: 8,
  payment: 9,
  maintenance_order: 10,
  journal_entry: 10,
  bank_transaction: 10,
};

/**
 * Belge zinciri — BFS her iki yön. upstream: bu belgeye kaynak olanlar (ve onların kaynakları),
 * downstream: bu belgeden türeyenler.
 */
export async function getChain(db: DbOrTx, type: DocumentType, id: string, opts: { maxDepth?: number } = {}): Promise<{ upstream: ChainNode[]; downstream: ChainNode[]; links: ChainLink[] }> {
  const maxDepth = opts.maxDepth ?? 12;
  const linkSeen = new Set<string>();
  const links: ChainLink[] = [];

  const walk = async (direction: 'up' | 'down'): Promise<Map<Key, { type: DocumentType; id: string; depth: number }>> => {
    const found = new Map<Key, { type: DocumentType; id: string; depth: number }>();
    const visited = new Set<Key>([key(type, id)]);
    let frontier: Array<{ type: DocumentType; id: string }> = [{ type, id }];
    let depth = 0;
    while (frontier.length && depth < maxDepth) {
      depth += 1;
      const next: Array<{ type: DocumentType; id: string }> = [];
      const ids = frontier.map((f) => f.id);
      const rows = direction === 'up'
        ? await db.select().from(documentLinks).where(inArray(documentLinks.targetId, ids))
        : await db.select().from(documentLinks).where(inArray(documentLinks.sourceId, ids));
      for (const r of rows) {
        const matches = frontier.some((f) => (direction === 'up' ? r.targetId === f.id && r.targetType === f.type : r.sourceId === f.id && r.sourceType === f.type));
        if (!matches) continue;
        if (!linkSeen.has(r.id)) {
          linkSeen.add(r.id);
          links.push({ sourceType: r.sourceType, sourceId: r.sourceId, targetType: r.targetType, targetId: r.targetId, qty: r.qty, amount: r.amount, sourceLineId: r.sourceLineId, targetLineId: r.targetLineId });
        }
        const other = direction === 'up' ? { type: r.sourceType, id: r.sourceId } : { type: r.targetType, id: r.targetId };
        const k = key(other.type, other.id);
        if (visited.has(k)) continue;
        visited.add(k);
        found.set(k, { ...other, depth });
        next.push(other);
      }
      frontier = next;
    }
    return found;
  };

  const [up, down] = [await walk('up'), await walk('down')];
  const all = [...up.values(), ...down.values()];
  const nodeInfo = await loadNodes(db, all);
  // direction 'up': getChain() bu diziyi "mevcut belgeye en yakından en uzağa" döndürür (depth artan);
  // DocumentChain bileşeni (apps/web/src/components/document-chain.tsx) ekranda kronolojik (en eskiden
  // en yeniye) okunması için bunu `reverse()`ler. Aynı derinlikte birden fazla düğüm varsa (ör. hem
  // sipariş hem irsaliye aynı ihracat sevkiyatına doğrudan bağlıysa, ikisi de depth=1), rank'ı tersine
  // (büyükten küçüğe) diziyoruz ki reverse() sonrası kanonik sırayla (küçükten büyüğe, ör. sipariş →
  // irsaliye) okunsun. direction 'down' zaten TERS ÇEVRİLMEDEN doğrudan render edildiği için aynı
  // derinlikteki düğümler doğrudan artan rank'a (kanonik kronolojik sıra) göre dizilir.
  const toNodes = (m: Map<Key, { type: DocumentType; id: string; depth: number }>, direction: 'up' | 'down') =>
    Array.from(m.values())
      .map((n) => ({ ...(nodeInfo.get(key(n.type, n.id)) ?? fallbackNode(n.type, n.id)), depth: n.depth }))
      .sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        const rankDiff = (TYPE_RANK[a.type] ?? 99) - (TYPE_RANK[b.type] ?? 99);
        const tieRank = direction === 'up' ? -rankDiff : rankDiff;
        if (tieRank !== 0) return tieRank;
        return a.date && b.date ? a.date.getTime() - b.date.getTime() : 0;
      });
  return { upstream: toNodes(up, 'up'), downstream: toNodes(down, 'down'), links };
}

const fallbackNode = (type: DocumentType, id: string): Omit<ChainNode, 'depth'> => ({
  type, id, docNo: id.slice(0, 8).toUpperCase(), status: null, date: null, amount: null, partnerName: null, partnerId: null, title: null,
});

async function loadNodes(db: DbOrTx, items: Array<{ type: DocumentType; id: string }>): Promise<Map<Key, Omit<ChainNode, 'depth'>>> {
  const out = new Map<Key, Omit<ChainNode, 'depth'>>();
  if (!items.length) return out;
  const rows = await db
    .select({
      type: documentIndex.type, recordId: documentIndex.recordId, docNo: documentIndex.docNo, status: documentIndex.status,
      docDate: documentIndex.docDate, amount: documentIndex.amount, title: documentIndex.title, partnerId: documentIndex.partnerId, partnerName: partners.name,
    })
    .from(documentIndex)
    .leftJoin(partners, eq(partners.id, documentIndex.partnerId))
    .where(inArray(documentIndex.recordId, Array.from(new Set(items.map((i) => i.id)))));
  for (const r of rows) {
    out.set(key(r.type, r.recordId), {
      type: r.type, id: r.recordId, docNo: r.docNo, status: r.status, date: r.docDate, amount: r.amount, partnerName: r.partnerName ?? null, partnerId: r.partnerId ?? null, title: r.title,
    });
  }
  return out;
}

/** Tek belgenin doğrudan bağları (satır düzeyi dahil) */
export async function getDirectLinks(db: DbOrTx, type: DocumentType, id: string): Promise<{ asSource: ChainLink[]; asTarget: ChainLink[] }> {
  const map = (r: typeof documentLinks.$inferSelect): ChainLink => ({ sourceType: r.sourceType, sourceId: r.sourceId, targetType: r.targetType, targetId: r.targetId, qty: r.qty, amount: r.amount, sourceLineId: r.sourceLineId, targetLineId: r.targetLineId });
  const asSource = (await db.select().from(documentLinks).where(and(eq(documentLinks.sourceType, type), eq(documentLinks.sourceId, id)))).map(map);
  const asTarget = (await db.select().from(documentLinks).where(and(eq(documentLinks.targetType, type), eq(documentLinks.targetId, id)))).map(map);
  return { asSource, asTarget };
}
