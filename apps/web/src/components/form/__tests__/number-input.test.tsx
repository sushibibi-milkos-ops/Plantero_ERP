// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { NumberInput, toFocusText, parseTrNumber } from '../number-input';

/**
 * Tarayıcının "seçili metnin yerine yaz" davranışını jsdom'da taklit eder: o anki seçim aralığı
 * yazılan metinle değiştirilir, sonra `change` olayı ateşlenir. Seçim yoksa (imleç sonda) metin
 * sona EKLENİR — tur 14'teki P0 hatasının tam mekanizması budur.
 */
function typeReplacingSelection(input: HTMLInputElement, typed: string) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const next = input.value.slice(0, start) + typed + input.value.slice(end);
  fireEvent.change(input, { target: { value: next } });
}

function Harness({ initial, maxDigits, minDigits }: { initial: string | null; maxDigits: number; minDigits: number }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <>
      <NumberInput value={value} onChange={setValue} maxDigits={maxDigits} minDigits={minDigits} aria-label="tutar" />
      <output data-testid="value">{value ?? 'NULL'}</output>
    </>
  );
}

describe('toFocusText — odaktaki ham metin görünen hassasiyeti korur', () => {
  it('para (2/2): numeric(18,4) kalanı 2 ondalığa yuvarlanır, binlik ayraç yok', () => {
    expect(toFocusText('919.9999', 2, 2)).toBe('920,00');
    expect(toFocusText('1020', 2, 2)).toBe('1020,00');
    expect(toFocusText('1234.5', 2, 2)).toBe('1234,50');
  });
  it('miktar (3/0): sondaki sıfırlar kırpılır', () => {
    expect(toFocusText('100.000', 3, 0)).toBe('100');
    expect(toFocusText('1.5000', 3, 0)).toBe('1,5');
    expect(toFocusText('0.0005', 3, 0)).toBe('0,001');
    expect(toFocusText('-2.25', 3, 0)).toBe('-2,25');
  });
  it('boş/geçersiz → boş metin', () => {
    expect(toFocusText(null, 2, 2)).toBe('');
    expect(toFocusText('', 2, 2)).toBe('');
    expect(toFocusText('abc', 2, 2)).toBe('');
  });
});

describe('NumberInput — odak → yazma → değer (tur 14 P0 regresyonu)', () => {
  it('4 ondalıklı değer odakta 2 ondalık kalır, tamamı seçilidir; yazılan metin yerine geçer ve doğru ayrıştırılır', () => {
    const r = render(<Harness initial="919.9999" maxDigits={2} minDigits={2} />);
    const input = r.getByLabelText('tutar') as HTMLInputElement;
    expect(input.value).toBe('920,00');

    act(() => {
      input.focus();
    });
    // Odakta metin değişMEdi ("919,9999" olmadı) ve tümü seçili
    expect(input.value).toBe('920,00');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('920,00'.length);

    act(() => {
      typeReplacingSelection(input, '1.020,00');
    });
    expect(input.value).toBe('1.020,00');
    expect(r.getByTestId('value').textContent).toBe('1020');

    act(() => {
      input.blur();
    });
    expect(r.getByTestId('value').textContent).toBe('1020.00');
    expect(input.value).toBe('1.020,00');
    cleanup();
  });

  it('miktar alanı (FormQty davranışı: 3 ondalık, min 0): odakta "100", yazılan "12,5" → "12.5"', () => {
    const r = render(<Harness initial="100.000" maxDigits={3} minDigits={0} />);
    const input = r.getByLabelText('tutar') as HTMLInputElement;
    expect(input.value).toBe('100');
    act(() => {
      input.focus();
    });
    expect(input.value).toBe('100');
    expect(input.selectionEnd).toBe(3);
    act(() => {
      typeReplacingSelection(input, '12,5');
    });
    expect(r.getByTestId('value').textContent).toBe('12.5');
    act(() => {
      input.blur();
    });
    expect(r.getByTestId('value').textContent).toBe('12.500');
    expect(input.value).toBe('12,5');
    cleanup();
  });

  it('boş alan: odak → yazma → blur (yeni kayıt akışı)', () => {
    const r = render(<Harness initial={null} maxDigits={2} minDigits={2} />);
    const input = r.getByLabelText('tutar') as HTMLInputElement;
    expect(input.value).toBe('');
    act(() => {
      input.focus();
    });
    act(() => {
      typeReplacingSelection(input, '300');
    });
    expect(r.getByTestId('value').textContent).toBe('300');
    act(() => {
      input.blur();
    });
    expect(r.getByTestId('value').textContent).toBe('300.00');
    expect(input.value).toBe('300,00');
    cleanup();
  });

  it('odaklanıp hiç yazmadan çıkınca değer maxDigits\'e yuvarlanır (önceki davranışla aynı)', () => {
    const r = render(<Harness initial="919.9999" maxDigits={2} minDigits={2} />);
    const input = r.getByLabelText('tutar') as HTMLInputElement;
    act(() => {
      input.focus();
    });
    act(() => {
      input.blur();
    });
    expect(r.getByTestId('value').textContent).toBe('920.00');
    cleanup();
  });

  it('kanıt: eski davranış (odakta "919,9999" + sona ekleme) ayrıştırılamıyordu', () => {
    expect(parseTrNumber('919,99991.020,00')).toBeNull();
  });
});
