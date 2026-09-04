import Decimal from 'decimal.js';
import { D } from '../money.js';

/**
 * ETGB (Elektronik Ticaret Gümrük Beyannamesi) mikro ihracat limitleri — `docs/modules/ihracat.md`.
 * Rejim `etgb` yalnızca 300 kg NET ağırlık VE 15.000 EUR bedel altındaki sevkiyatlarda kullanılabilir
 * ("kolay usul"); ikisinden biri aşılırsa sevkiyat standart (beyannameli) rejime tabidir.
 */
export const ETGB_MAX_NET_WEIGHT_KG = new Decimal(300);
export const ETGB_MAX_VALUE_EUR = new Decimal(15000);

export type EtgbLimitCheck = {
  withinLimit: boolean;
  netWeightKg: Decimal | null;
  amountEur: Decimal | null;
  reasons: string[];
};

/**
 * `amountEur` sevkiyatın EUR karşılığı olmalı (başka para biriminde ise çağıran TCMB kuruyla çevirir —
 * bu fonksiyon saf bir eşik kontrolüdür, kur çözümlemesi yapmaz).
 */
export function checkEtgbLimit(input: { netWeightKg?: Decimal | string | number | null; amountEur?: Decimal | string | number | null }): EtgbLimitCheck {
  const netWeightKg = input.netWeightKg === null || input.netWeightKg === undefined ? null : D(input.netWeightKg);
  const amountEur = input.amountEur === null || input.amountEur === undefined ? null : D(input.amountEur);
  const reasons: string[] = [];

  if (netWeightKg !== null && netWeightKg.gt(ETGB_MAX_NET_WEIGHT_KG)) {
    reasons.push(`Net ağırlık (${netWeightKg.toFixed(2)} kg) ETGB sınırını (${ETGB_MAX_NET_WEIGHT_KG.toFixed(0)} kg) aşıyor`);
  }
  if (amountEur !== null && amountEur.gt(ETGB_MAX_VALUE_EUR)) {
    reasons.push(`Tutar (€${amountEur.toFixed(2)}) ETGB sınırını (€${ETGB_MAX_VALUE_EUR.toFixed(0)}) aşıyor`);
  }
  return { withinLimit: reasons.length === 0, netWeightKg, amountEur, reasons };
}

/** Girdi rejimi 'etgb' istiyorsa ama limit aşılmışsa 'standard'a düşürür; aksi halde girdiyi korur. */
export function resolveRegime(requested: 'standard' | 'etgb', check: EtgbLimitCheck): 'standard' | 'etgb' {
  if (requested === 'etgb' && !check.withinLimit) return 'standard';
  return requested;
}
