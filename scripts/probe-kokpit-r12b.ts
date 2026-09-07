/** Tur 11 kokpit prob-B: rozet anatomisi (span[data-status]) + kanal satırı kademeleri + StatStrip anatomisi. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const OUT = resolve(process.cwd(), 'artifacts', 'critic', 'measure-kokpit-r12');
const ROLES = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];

const SRC = `(() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  const main = document.querySelector('main') || document.body;
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const secTitle = (el) => { const s = el.closest('section'); return s ? (s.querySelector('h2')?.textContent || '').trim() : '(yok)'; };

  const badges = Array.from(main.querySelectorAll('span[data-status]')).filter(vis);
  const bySec = {};
  badges.forEach((b) => {
    const cs = getComputedStyle(b);
    const dot = b.querySelector('span[aria-hidden]');
    const rec = {
      text: (b.textContent || '').replace(/\\s+/g, ' ').trim(),
      status: b.getAttribute('data-status'),
      bg: cs.backgroundColor, color: cs.color, h: r1(b.getBoundingClientRect().height), fs: cs.fontSize,
      dotBg: dot ? getComputedStyle(dot).backgroundColor : null,
      filled: cs.backgroundColor !== 'rgba(0, 0, 0, 0)',
    };
    (bySec[secTitle(b)] = bySec[secTitle(b)] || []).push(rec);
  });
  const badgeAnatomy = Object.entries(bySec).map(([s, arr]) => {
    const sig = {};
    arr.forEach((b) => { const k = b.bg + '|' + b.color + '|' + b.dotBg; (sig[k] = sig[k] || new Set()).add(b.text); });
    return {
      section: s, n: arr.length,
      filled: arr.filter((b) => b.filled).length,
      unfilled: arr.filter((b) => !b.filled).map((b) => b.text),
      heights: Array.from(new Set(arr.map((b) => b.h))),
      fontSizes: Array.from(new Set(arr.map((b) => b.fs))),
      // aynı görsel imzayı paylaşan FARKLI etiketler
      collisions: Object.entries(sig).map(([k, set]) => ({ sig: k, labels: Array.from(set) })).filter((c) => c.labels.length > 1),
    };
  });

  // Section satırlarının sayısal kademeleri
  const sections = Array.from(main.querySelectorAll('section')).filter(vis);
  const sectionRows = sections.map((s) => {
    const title = (s.querySelector('h2')?.textContent || '').trim();
    const rows = Array.from(s.querySelectorAll('a,div')).filter((el) => {
      if (!vis(el)) return false;
      const cs = getComputedStyle(el);
      return cs.display === 'flex' && cs.paddingLeft === '16px' && cs.paddingRight === '16px';
    });
    return {
      title, rowCount: rows.length,
      rowHeights: Array.from(new Set(rows.map((r) => r1(r.getBoundingClientRect().height)))),
      tiers: rows.map((r) => {
        const nodes = Array.from(r.querySelectorAll('*')).filter((n) => n.children.length === 0 && /[0-9]/.test(n.textContent || ''));
        return nodes.map((n) => { const cs = getComputedStyle(n); return (n.textContent||'').trim().slice(0,22) + '=' + cs.fontSize + '/' + cs.fontWeight; }).join(' | ');
      }),
    };
  }).filter((s) => s.rowCount > 0);

  // StatStrip: grid/flex hücreleri, dikey ayraçlı şeritler
  const strips = [];
  sections.forEach((s) => {
    Array.from(s.querySelectorAll('div')).forEach((d) => {
      const cs = getComputedStyle(d);
      if (cs.display !== 'grid') return;
      const kids = Array.from(d.children).filter(vis);
      if (kids.length < 3) return;
      const kcs = kids.map((k) => getComputedStyle(k));
      if (!kcs.some((c) => c.borderLeftWidth !== '0px')) return;
      strips.push({
        section: (s.querySelector('h2')?.textContent || '').trim(),
        cells: kids.length,
        cellH: Array.from(new Set(kids.map((k) => r1(k.getBoundingClientRect().height)))),
        lines: kids.map((k) => Array.from(k.querySelectorAll('*')).filter((n) => n.children.length === 0 && (n.textContent||'').trim()).map((n) => { const c = getComputedStyle(n); return (n.textContent||'').trim().slice(0,18) + '=' + c.fontSize + '/' + c.fontWeight; }).join(' > ')),
      });
    });
  });
  return { badgeAnatomy, sectionRows, strips };
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  try {
    for (const as of ROLES) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', colorScheme: 'light' });
      const page = await ctx.newPage();
      await openRoute(page, { base, route: '/kokpit', as });
      out[as] = await page.evaluate(SRC);
      await ctx.close();
    }
  } finally { await browser.close(); }
  writeFileSync(resolve(OUT, 'probe-r12b.json'), JSON.stringify(out, null, 2));
  console.log('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
