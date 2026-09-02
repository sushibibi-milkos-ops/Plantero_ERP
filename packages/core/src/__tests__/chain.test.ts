import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { linkDocuments, getChain, indexDocument, getDirectLinks } from '../documents/chain.js';
import { withRollback, seedBase, ctx, d } from './helpers.js';

describe('document chain', () => {
  it('teklif → sipariş → irsaliye → fatura zinciri iki yönde BFS', async () => {
    await withRollback(async (tx) => {
      const b = await seedBase(tx);
      const qt = randomUUID(), so = randomUUID(), dn = randomUUID(), inv = randomUUID(), pay = randomUUID();
      await indexDocument(tx, { type: 'quotation', recordId: qt, docNo: 'QT-1', partnerId: b.customer.id, status: 'accepted', amount: d(1000) });
      await indexDocument(tx, { type: 'sales_order', recordId: so, docNo: 'SO-1', partnerId: b.customer.id, status: 'confirmed', amount: d(1000) });
      await indexDocument(tx, { type: 'delivery', recordId: dn, docNo: 'DN-1', partnerId: b.customer.id, status: 'shipped' });
      await indexDocument(tx, { type: 'invoice', recordId: inv, docNo: 'INV-1', partnerId: b.customer.id, status: 'posted', amount: d(1010) });
      await indexDocument(tx, { type: 'payment', recordId: pay, docNo: 'PAY-1', partnerId: b.customer.id, status: 'posted', amount: d(1010) });

      await linkDocuments(tx, { sourceType: 'quotation', sourceId: qt, targetType: 'sales_order', targetId: so }, ctx);
      await linkDocuments(tx, { sourceType: 'sales_order', sourceId: so, targetType: 'delivery', targetId: dn, qty: d(10) }, ctx);
      await linkDocuments(tx, { sourceType: 'delivery', sourceId: dn, targetType: 'invoice', targetId: inv, qty: d(10) }, ctx);
      await linkDocuments(tx, { sourceType: 'invoice', sourceId: inv, targetType: 'payment', targetId: pay, amount: d(1010) }, ctx);
      // Aynı bağ tekrar → oluşturulmaz
      const dup = await linkDocuments(tx, { sourceType: 'sales_order', sourceId: so, targetType: 'delivery', targetId: dn }, ctx);
      expect(dup.created).toBe(false);

      const chain = await getChain(tx, 'delivery', dn);
      expect(chain.upstream.map((n) => n.docNo)).toEqual(['SO-1', 'QT-1']);
      expect(chain.upstream[0]!.depth).toBe(1);
      expect(chain.upstream[1]!.depth).toBe(2);
      expect(chain.downstream.map((n) => n.docNo)).toEqual(['INV-1', 'PAY-1']);
      expect(chain.downstream[0]!.partnerName).toBe(b.customer.name);
      expect(chain.downstream[1]!.amount).toBe('1010.0000');
      expect(chain.links).toHaveLength(4);

      const fromQt = await getChain(tx, 'quotation', qt);
      expect(fromQt.upstream).toHaveLength(0);
      expect(fromQt.downstream.map((n) => n.type)).toEqual(['sales_order', 'delivery', 'invoice', 'payment']);

      const direct = await getDirectLinks(tx, 'sales_order', so);
      expect(direct.asSource).toHaveLength(1);
      expect(direct.asTarget).toHaveLength(1);
    });
  });

  it('indexDocument upsert: durum değişince güncellenir, satır çoğalmaz', async () => {
    await withRollback(async (tx) => {
      const id = randomUUID();
      const a = await indexDocument(tx, { type: 'sales_order', recordId: id, docNo: 'SO-X', status: 'draft' });
      const b = await indexDocument(tx, { type: 'sales_order', recordId: id, docNo: 'SO-X', status: 'confirmed', amount: d('5.5') });
      expect(a.id).toBe(b.id);
      const chain = await getChain(tx, 'sales_order', id);
      expect(chain.upstream).toHaveLength(0);
      // İndekslenmemiş belge zincirde yine görünür (fallback docNo)
      const other = randomUUID();
      await linkDocuments(tx, { sourceType: 'sales_order', sourceId: id, targetType: 'delivery', targetId: other }, ctx);
      const c2 = await getChain(tx, 'sales_order', id);
      expect(c2.downstream[0]!.id).toBe(other);
      expect(c2.downstream[0]!.docNo).toBeTruthy();
    });
  });
});
