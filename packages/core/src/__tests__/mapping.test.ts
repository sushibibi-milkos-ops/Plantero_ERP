import { describe, it, expect } from 'vitest';
import { moveAccountLines, inventoryAccountFor, INVENTORY_ACCOUNT_BY_TYPE, ACCOUNT_CATALOG, WIP_ACCOUNT, SEMI_FINISHED_ACCOUNT, journalCodeForMove } from '../accounting/mapping.js';

describe('hesap eşlemesi (ARCHITECTURE §6.7)', () => {
  it('151 ana hesabı kayıt almaz; 151.01 / 151.02 alt hesapları katalogda', () => {
    const c151 = ACCOUNT_CATALOG.find((a) => a.code === '151');
    expect(c151?.isPostable).toBe(false);
    expect(ACCOUNT_CATALOG.find((a) => a.code === WIP_ACCOUNT)?.parentCode).toBe('151');
    expect(ACCOUNT_CATALOG.find((a) => a.code === SEMI_FINISHED_ACCOUNT)?.parentCode).toBe('151');
  });

  it('ürün tipi → envanter hesabı', () => {
    expect(INVENTORY_ACCOUNT_BY_TYPE.semi_finished).toBe('151.02');
    expect(INVENTORY_ACCOUNT_BY_TYPE.merchandise).toBe('153');
    expect(inventoryAccountFor({ type: 'raw_material' })).toBe('150');
    expect(inventoryAccountFor({ type: 'packaging' })).toBe('150');
    expect(inventoryAccountFor({ type: 'finished' })).toBe('152');
    expect(inventoryAccountFor({ type: 'semi_finished', inventoryAccountCode: '151.03' })).toBe('151.03');
  });

  it('üretim hareketleri 151.01 WIP üzerinden akar', () => {
    expect(moveAccountLines('consumption', '150')).toEqual([
      { accountCode: '151.01', side: 'debit', share: 'total' },
      { accountCode: '150', side: 'credit', share: 'total' },
    ]);
    expect(moveAccountLines('production', '152')).toEqual([
      { accountCode: '152', side: 'debit', share: 'total' },
      { accountCode: '151.01', side: 'credit', share: 'material' },
      { accountCode: '731', side: 'credit', share: 'overhead' },
    ]);
    expect(moveAccountLines('production', '151.02')![0]!.accountCode).toBe('151.02');
    expect(moveAccountLines('byproduct', '152')).toEqual([
      { accountCode: '152', side: 'debit', share: 'total' },
      { accountCode: '151.01', side: 'credit', share: 'total' },
    ]);
    expect(journalCodeForMove('production')).toBe('URT');
  });

  it('fire: fiziksel stoktan 659 / 15X, iş emri WIP firesi 659 / 151.01', () => {
    expect(moveAccountLines('scrap', '150')).toEqual([
      { accountCode: '659', side: 'debit', share: 'total' },
      { accountCode: '150', side: 'credit', share: 'total' },
    ]);
    expect(moveAccountLines('scrap', '150', '621', { wipScrap: true })).toEqual([
      { accountCode: '659', side: 'debit', share: 'total' },
      { accountCode: '151.01', side: 'credit', share: 'total' },
    ]);
  });

  it('değersiz hareketler eşlenmez', () => {
    expect(moveAccountLines('transfer', '150')).toBeNull();
    expect(moveAccountLines('quarantine_release', '150')).toBeNull();
  });
});
