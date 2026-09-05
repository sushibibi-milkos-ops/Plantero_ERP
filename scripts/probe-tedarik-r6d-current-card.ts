import { writeFileSync } from 'node:fs';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const base = defaultBaseUrl();
const PO = process.env.PO_ID!;

const SRC = `(() => {
  var nav = document.querySelector('[role="navigation"][aria-label="Belge zinciri"]');
  if (!nav) return { navFound: false };
  var links = Array.prototype.slice.call(nav.querySelectorAll('a'));
  return {
    navFound: true,
    linkCount: links.length,
    links: links.map(function (l) {
      var cs = getComputedStyle(l);
      return {
        ariaCurrent: l.getAttribute('aria-current'),
        cls: l.getAttribute('class'),
        borderTopColor: cs.borderTopColor,
        backgroundColor: cs.backgroundColor,
        boxShadow: cs.boxShadow,
        txt: (l.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      };
    }),
  };
})()`;

async function main() {
  const browser = await launchBrowser();
  const c1 = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
  const p1 = await c1.newPage();
  await openRoute(p1, { base, route: `/satin-alma/siparisler/${PO}`, as: 'admin' });
  const result = await p1.evaluate(SRC);
  await c1.close();
  await browser.close();
  writeFileSync('artifacts/critic/probe-tedarik-r6d-current-card.json', JSON.stringify(result, null, 1));
  console.error(JSON.stringify(result, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
