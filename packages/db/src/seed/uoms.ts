import type { DbOrTx } from '../client.js';
import { uoms } from '../schema/index.js';
import { log, type SeedSummary } from './_helpers.js';

const UOMS: Array<{ code: string; name: string; category: string; ratioToBase: string; baseCode: string | null }> = [
  { code: 'ADET', name: 'Adet', category: 'unit', ratioToBase: '1', baseCode: null },
  { code: 'KG', name: 'Kilogram', category: 'weight', ratioToBase: '1', baseCode: null },
  { code: 'G', name: 'Gram', category: 'weight', ratioToBase: '0.001', baseCode: 'KG' },
  { code: 'L', name: 'Litre', category: 'volume', ratioToBase: '1', baseCode: null },
  { code: 'ML', name: 'Mililitre', category: 'volume', ratioToBase: '0.001', baseCode: 'L' },
  { code: 'KOLI', name: 'Koli', category: 'unit', ratioToBase: '1', baseCode: 'ADET' },
  { code: 'PALET', name: 'Palet', category: 'unit', ratioToBase: '1', baseCode: 'ADET' },
  { code: 'SASE', name: 'Saşe', category: 'unit', ratioToBase: '1', baseCode: 'ADET' },
];

export async function seedUoms(db: DbOrTx, summary: SeedSummary): Promise<void> {
  log('uoms', 'ölçü birimleri...');
  for (const u of UOMS) {
    await db
      .insert(uoms)
      .values(u)
      .onConflictDoUpdate({ target: uoms.code, set: { name: u.name, category: u.category, ratioToBase: u.ratioToBase, baseCode: u.baseCode } });
  }
  summary.add('uoms', UOMS.length);
}
