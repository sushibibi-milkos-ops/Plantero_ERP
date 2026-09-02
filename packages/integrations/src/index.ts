export * from './types.js';

export { bizimhesap } from './einvoice/bizimhesap.js';
export { trendyol } from './marketplace/trendyol.js';
export { hepsiburada } from './marketplace/hepsiburada.js';
export { openBanking } from './bank/openBanking.js';
export { parseMt940 } from './bank/mt940.js';
export { parseCsv } from './bank/csv.js';
export { parseTcmbXml, tcmb } from './rates/tcmb.js';
export { whatsapp } from './messaging/whatsapp.js';
export { email } from './messaging/email.js';
export { renderPdf } from './pdf/render.js';
export * from './pdf/templates.js';

import { bizimhesap } from './einvoice/bizimhesap.js';
import { openBanking } from './bank/openBanking.js';
import { hepsiburada } from './marketplace/hepsiburada.js';
import { trendyol } from './marketplace/trendyol.js';
import { email } from './messaging/email.js';
import { whatsapp } from './messaging/whatsapp.js';
import { tcmb } from './rates/tcmb.js';
import type { IntegrationStatus } from './types.js';

/** Tüm entegrasyon adaptörlerinin canlı/sandbox durumunu döner */
export function getIntegrationStatus(): IntegrationStatus {
  return {
    einvoice: bizimhesap.mode,
    trendyol: trendyol.mode,
    hepsiburada: hepsiburada.mode,
    bank: openBanking.mode,
    tcmb: tcmb.mode,
    whatsapp: whatsapp.mode,
    email: email.mode,
  };
}
