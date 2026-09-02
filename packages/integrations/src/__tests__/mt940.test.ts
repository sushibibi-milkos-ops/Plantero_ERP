import { describe, expect, it } from 'vitest';
import { parseMt940 } from '../bank/mt940.js';

const SAMPLE = [
  ':20:STMT20260901001',
  ':25:TR330006100519786457841326',
  ':28C:00001/001',
  ':60F:C260901TRY125430,50',
  ':61:2609010901D1500,00NTRFNONREF//FT26090112345',
  ':86:123?00EFT Cikis Ahmet Yilmaz?20Fatura Odemesi',
  ':61:260902C3200,75NTRFNONREF//FT26090254321',
  ':86:123?00Havale Giris ABC Gida Ltd Sti?20Siparis Odemesi',
  ':61:260903C980,00NCHGNONREF//FT26090398765',
  ':86:123?00Banka Masrafi',
  ':62F:C260903TRY128111,25',
].join('\n');

describe('parseMt940', () => {
  it('hesap, ekstre no ve bakiyeleri doğru çözümler', () => {
    const result = parseMt940(SAMPLE);
    expect(result.statementRef).toBe('STMT20260901001');
    expect(result.accountIban).toBe('TR330006100519786457841326');
    expect(result.statementNo).toBe('00001/001');
    expect(result.openingBalance).toEqual({ mark: 'C', amount: '125430.5000', date: '2026-09-01', currency: 'TRY' });
    expect(result.closingBalance).toEqual({ mark: 'C', amount: '128111.2500', date: '2026-09-03', currency: 'TRY' });
  });

  it('3 hareketi doğru işaret, tutar ve tarihle çıkarır', () => {
    const result = parseMt940(SAMPLE);
    expect(result.transactions).toHaveLength(3);

    const [first, second, third] = result.transactions;
    expect(first).toMatchObject({ txDate: '2026-09-01', valueDate: '2026-09-01', amount: '-1500.0000', currency: 'TRY' });
    expect(first!.description).toBe('EFT Cikis Ahmet Yilmaz Fatura Odemesi');
    expect(first!.externalRef).toBe('FT26090112345');

    expect(second).toMatchObject({ txDate: '2026-09-02', amount: '3200.7500' });
    expect(second!.description).toBe('Havale Giris ABC Gida Ltd Sti Siparis Odemesi');

    expect(third).toMatchObject({ txDate: '2026-09-03', amount: '980.0000' });
    expect(third!.description).toBe('Banka Masrafi');
  });

  it('açılış + hareketler = kapanış bakiyesini tutturur', () => {
    const result = parseMt940(SAMPLE);
    const sum = result.transactions.reduce((acc, t) => acc + Number(t.amount), Number(result.openingBalance.amount));
    expect(Math.round(sum * 100) / 100).toBeCloseTo(Number(result.closingBalance.amount), 2);
  });

  it('storno (RD/RC) işaretinde yönü ters çevirir', () => {
    const text = [
      ':20:STMT2',
      ':25:TR000000000000000000000000',
      ':60F:C260101TRY0,00',
      ':61:260101RD250,00NTRFREF1',
      ':86:Storno edilen borc',
      ':62F:C260101TRY250,00',
    ].join('\n');
    const result = parseMt940(text);
    expect(result.transactions[0]!.amount).toBe('250.0000'); // RD = borcun storno'su → alacak
  });

  it('gerekli alanlar eksikse hata fırlatır', () => {
    expect(() => parseMt940(':20:X\n:61:260101C10,00NTRFREF')).toThrow(/hesap alanı/);
  });
});
