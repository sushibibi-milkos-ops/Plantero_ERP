// Tur 7 doğrulaması (shell-documentchain-baseline-01 kapanışı): document-chain.tsx etiket satırına
// 2 satırlık sabit yükseklik (min-h-8 leading-4) eklendikten SONRA zincirdeki kartların belge no'su
// (docNo) elemanlarının `top` konumlarını ölçer — probe-tedarik-r6.ts'teki `chain` sorgusuyla AYNI
// DOM deseni (PO/GR/PINV/QC-YYYY-NNN metni taşıyan yaprak eleman), yalnızca desen kalite kontrol
// (QC) belgesini de kapsayacak şekilde genişletildi.
import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const PO = process.env.PO_ID!;
const SRC = `(() => {
  var scroller = document.querySelector('[aria-label="Belge zinciri"]') || document.querySelector('main');
  var chain = Array.prototype.slice.call(scroller.querySelectorAll('*')).filter(function (e) {
    return e.children.length === 0 && /^(PO|GR|PINV|QC)-\\d{4}-\\d+$/.test((e.textContent || '').trim());
  }).map(function (e) { var r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim(), top: Math.round(r.top), left: Math.round(r.left) }; });
  return { chain: chain };
})()`;
async function main() {
  const b = await launchBrowser();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const p = await c.newPage();
  await openRoute(p, { base, route: `/satin-alma/siparisler/${PO}`, as: 'admin' });
  const result = await p.evaluate(SRC) as { chain: Array<{ t: string; top: number; left: number }> };
  const tops = result.chain.map((r) => r.top);
  const spread = tops.length ? Math.max(...tops) - Math.min(...tops) : null;
  await c.close();
  await b.close();
  writeFileSync('artifacts/critic/probe-tedarik-r7h.json', JSON.stringify({ ...result, topSpread: spread }, null, 1));
  console.error('spread=' + spread);
}
main().catch((e) => { console.error(e); process.exit(1); });
