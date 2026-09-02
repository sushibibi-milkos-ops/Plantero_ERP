import { describe, expect, it } from 'vitest';
import { parseCsv } from '../bank/csv.js';

describe('parseCsv', () => {
  it('varsayılan Türk banka biçimini (Tarih;Açıklama;Tutar;Bakiye) çözümler', () => {
    const csv = ['Tarih;Açıklama;Tutar;Bakiye', '01.09.2026;EFT Gelen ABC Gida;1500,50;125430,50', '02.09.2026;Fatura Odeme;-320,00;125110,50'].join(
      '\n',
    );
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ txDate: '2026-09-01', amount: '1500.5000', description: 'EFT Gelen ABC Gida', balanceAfter: '125430.5000' });
    expect(rows[1]).toMatchObject({ txDate: '2026-09-02', amount: '-320.0000' });
  });

  it('özel kolon eşlemesi ve ayraç ile çalışır', () => {
    const csv = ['Date,Desc,Amount', '2026-09-01,Havale,1000.25'].join('\n');
    const rows = parseCsv(csv, { delimiter: ',', dateColumn: 'Date', descriptionColumn: 'Desc', amountColumn: 'Amount', dateFormat: 'YYYY-MM-DD', decimalSeparator: '.' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ txDate: '2026-09-01', amount: '1000.2500', description: 'Havale' });
  });

  it('başlıksız dosyada varsayılan kolon sırasını kullanır', () => {
    const csv = '01.09.2026;Test;100,00;1000,00';
    const rows = parseCsv(csv, { hasHeader: false });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe('100.0000');
  });

  it('binlik ayraçlı tutarları doğru ayrıştırır', () => {
    const csv = ['Tarih;Açıklama;Tutar;Bakiye', '01.09.2026;Büyük Tahsilat;12.345,67;50000,00'].join('\n');
    const rows = parseCsv(csv);
    expect(rows[0]!.amount).toBe('12345.6700');
  });

  it('bilinmeyen kolon adında hata fırlatır', () => {
    const csv = ['Tarih;Aciklama;Tutar', '01.09.2026;x;10'].join('\n');
    expect(() => parseCsv(csv)).toThrow(/kolonu bulunamadı/);
  });

  it('aynı girdi için deterministik externalRef üretir (idempotent)', () => {
    const csv = ['Tarih;Açıklama;Tutar;Bakiye', '01.09.2026;Test;10,00;10,00'].join('\n');
    expect(parseCsv(csv)[0]!.externalRef).toBe(parseCsv(csv)[0]!.externalRef);
  });
});
