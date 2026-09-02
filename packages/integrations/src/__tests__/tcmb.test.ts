import { describe, expect, it } from 'vitest';
import { parseTcmbXml, tcmb } from '../rates/tcmb.js';

const SAMPLE_XML = `<?xml version="1.0" encoding="ISO-8859-9"?>
<Tarih_Date Tarih="02.09.2026" Date="09/02/2026" Bulten_No="2026/167">
  <Currency Kod="USD" CurrencyCode="USD" Kod_No="840">
    <Unit>1</Unit>
    <Isim>ABD DOLARI</Isim>
    <CurrencyName>US DOLLAR</CurrencyName>
    <ForexBuying>34.1050</ForexBuying>
    <ForexSelling>34.2350</ForexSelling>
    <BanknoteBuying>34.0900</BanknoteBuying>
    <BanknoteSelling>34.3000</BanknoteSelling>
  </Currency>
  <Currency Kod="EUR" CurrencyCode="EUR" Kod_No="978">
    <Unit>1</Unit>
    <Isim>EURO</Isim>
    <CurrencyName>EURO</CurrencyName>
    <ForexBuying>37.2200</ForexBuying>
    <ForexSelling>37.4100</ForexSelling>
    <BanknoteBuying>37.2000</BanknoteBuying>
    <BanknoteSelling>37.4600</BanknoteSelling>
  </Currency>
  <Currency Kod="JPY" CurrencyCode="JPY" Kod_No="392">
    <Unit>100</Unit>
    <Isim>JAPON YENİ</Isim>
    <CurrencyName>JAPENESE YEN</CurrencyName>
    <ForexBuying>22.8100</ForexBuying>
    <ForexSelling>22.9600</ForexSelling>
    <BanknoteBuying></BanknoteBuying>
    <BanknoteSelling></BanknoteSelling>
  </Currency>
  <Currency Kod="XDR" CurrencyCode="XDR" Kod_No="960">
    <Unit>1</Unit>
    <Isim>SDR</Isim>
    <CurrencyName>SDR</CurrencyName>
    <ForexBuying></ForexBuying>
    <ForexSelling></ForexSelling>
  </Currency>
</Tarih_Date>`;

describe('parseTcmbXml', () => {
  it('USD/EUR alım-satım kurlarını doğru çözümler', () => {
    const rates = parseTcmbXml(SAMPLE_XML);
    const usd = rates.find((r) => r.currency === 'USD');
    const eur = rates.find((r) => r.currency === 'EUR');
    expect(usd).toEqual({ currency: 'USD', buying: '34.105000', selling: '34.235000' });
    expect(eur).toEqual({ currency: 'EUR', buying: '37.220000', selling: '37.410000' });
  });

  it('birimi 1 olmayan para birimlerini (JPY, Unit=100) orana böler', () => {
    const rates = parseTcmbXml(SAMPLE_XML);
    const jpy = rates.find((r) => r.currency === 'JPY');
    expect(jpy).toEqual({ currency: 'JPY', buying: '0.228100', selling: '0.229600' });
  });

  it('ForexBuying/Selling boş olan para birimlerini atlar', () => {
    const rates = parseTcmbXml(SAMPLE_XML);
    expect(rates.find((r) => r.currency === 'XDR')).toBeUndefined();
    expect(rates).toHaveLength(3);
  });

  it('boş XML için boş dizi döner', () => {
    expect(parseTcmbXml('<Tarih_Date></Tarih_Date>')).toEqual([]);
  });
});

describe('tcmb sandbox', () => {
  it('env yoksa sandbox modundadır ve deterministik kur döner', async () => {
    delete process.env.TCMB_LIVE;
    expect(tcmb.mode).toBe('sandbox');
    const a = await tcmb.fetchDaily(new Date('2026-09-02T00:00:00Z'));
    const b = await tcmb.fetchDaily(new Date('2026-09-02T00:00:00Z'));
    expect(a).toEqual(b);
    expect(a.find((r) => r.currency === 'USD')).toBeDefined();
  });

  it('farklı günlerde farklı (ama makul) kur üretir', async () => {
    const day1 = await tcmb.fetchDaily(new Date('2026-09-01T00:00:00Z'));
    const day2 = await tcmb.fetchDaily(new Date('2026-09-02T00:00:00Z'));
    const usd1 = day1.find((r) => r.currency === 'USD')!;
    const usd2 = day2.find((r) => r.currency === 'USD')!;
    expect(usd1.buying).not.toBe(usd2.buying);
    expect(Number(usd1.buying)).toBeGreaterThan(30);
    expect(Number(usd1.buying)).toBeLessThan(40);
    expect(Number(usd1.selling)).toBeGreaterThan(Number(usd1.buying));
  });

  it('TCMB_LIVE=1 iken live moda geçer', () => {
    process.env.TCMB_LIVE = '1';
    expect(tcmb.mode).toBe('live');
    delete process.env.TCMB_LIVE;
  });
});
