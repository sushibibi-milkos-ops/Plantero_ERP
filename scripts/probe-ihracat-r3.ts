/**
 * Tur 2 düzeltme doğrulaması — ihracat modülü. Çıktı: artifacts/critic/probe-ihracat-r3.json
 * `pnpm db:reset` her çalıştırıldığında yeni UUID'ler ürettiği için sevkiyat id'si burada DB'den
 * taze okunur (probe-ihracat-r2.ts'teki gibi sabitlenmez).
 * Kullanım: pnpm tsx scripts/probe-ihracat-r3.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
import { db } from '../packages/db/src/client';
import { exportShipments } from '../packages/db/src/schema/index';
import { eq } from 'drizzle-orm';

const BASE = defaultBaseUrl();

async function withPage<T>(browser: Browser, route: string, w: number, h: number, fn: (p: Page) => Promise<T>): Promise<T> {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    isMobile: w < 500,
    hasTouch: w < 500,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
  });
  const page = await ctx.newPage();
  await openRoute(page, { base: BASE, route, as: 'admin' });
  const out = await fn(page);
  await ctx.close();
  return out;
}

const HELPERS = `
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0') return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
  const r1 = (n) => Math.round(n*10)/10;
`;

const TABLE_INFO = `(() => {
  ${HELPERS}
  const out = [];
  document.querySelectorAll('table').forEach((t, i) => {
    if (!vis(t)) return;
    const ths = Array.from(t.querySelectorAll('thead th')).filter(vis);
    const rows = Array.from(t.querySelectorAll('tbody tr')).filter(vis);
    const cols = ths.map((th, ci) => {
      const cells = rows.map(r => (r.children[ci] ? r.children[ci].textContent : '' ).replace(/\\s+/g,' ').trim());
      const dash = cells.filter(c => c === '—' || c === '').length;
      return { head: (th.textContent||'').replace(/\\s+/g,' ').trim(), w: r1(th.getBoundingClientRect().width), dash, rows: cells.length, ratio: cells.length ? r1(dash/cells.length) : null };
    });
    out.push({ i, rows: rows.length, cols });
  });
  return out;
})()`;

const PAGE_INFO = `(() => {
  ${HELPERS}
  const de = document.documentElement;
  const touch = [];
  document.querySelectorAll('button,a,input,select,textarea,[role=button],[role=tab],[data-slot=select-trigger]').forEach(el => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) touch.push({ sel: el.tagName.toLowerCase()+(el.getAttribute('data-slot')?'[data-slot='+el.getAttribute('data-slot')+']':''), t: (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,28), w: r1(r.width), h: r1(r.height) });
  });
  return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflowX: de.scrollWidth > de.clientWidth, touchBelow44: touch };
})()`;

const CARDS_INFO = `(() => {
  ${HELPERS}
  const lists = [];
  document.querySelectorAll('ul').forEach(ul => {
    const lis = Array.from(ul.children).filter(el => el.tagName === 'LI' && vis(el));
    if (lis.length < 1) return;
    const hs = lis.map(li => r1(li.getBoundingClientRect().height));
    lists.push({ count: lis.length, heights: hs, samples: lis.slice(0,3).map(li => (li.textContent||'').replace(/\\s+/g,' ').trim().slice(0,90)) });
  });
  return lists;
})()`;

async function main() {
  const [ship] = await db.select({ id: exportShipments.id, docNo: exportShipments.docNo }).from(exportShipments).where(eq(exportShipments.docNo, 'EXP-2026-000002')).limit(1);
  if (!ship) throw new Error('EXP-2026-000002 bulunamadı');
  const SHIP = ship.id;

  const browser = await launchBrowser();
  const out: Record<string, unknown> = { shipmentId: SHIP };

  // detay-06/07/08/09
  out.detayDesk = await withPage(browser, `/ihracat/sevkiyatlar/${SHIP}`, 1440, 900, async (p) => {
    const res: Record<string, unknown> = {};
    for (const tab of ['Belgeler', 'Çeki listesi']) {
      await p.getByRole('tab', { name: tab }).click();
      await p.waitForTimeout(400);
      res[tab] = { tables: await p.evaluate(TABLE_INFO) };
    }
    // Proforma & gümrük panel — Net/brüt ağırlık span renkleri
    await p.getByRole('tab', { name: 'Çeki listesi' }).click();
    await p.waitForTimeout(200);
    res.weightPanel = await p.evaluate(`(() => { ${HELPERS}
      const label = Array.from(document.querySelectorAll('div')).find(d => (d.textContent||'').trim() === 'Net / brüt ağırlık');
      if (!label) return null;
      const valueDiv = label.nextElementSibling;
      const spans = valueDiv ? Array.from(valueDiv.querySelectorAll('span')) : [];
      return { text: valueDiv ? valueDiv.textContent.trim() : null, colors: spans.map(s => getComputedStyle(s).color) };
    })()`);
    return res;
  });

  out.detayMob = await withPage(browser, `/ihracat/sevkiyatlar/${SHIP}`, 390, 844, async (p) => {
    const res: Record<string, unknown> = { page: await p.evaluate(PAGE_INFO) };
    await p.getByRole('tab', { name: 'Belgeler' }).click();
    await p.waitForTimeout(400);
    res['Belgeler'] = { cards: await p.evaluate(CARDS_INFO), page: await p.evaluate(PAGE_INFO) };
    return res;
  });

  // kurlar-06/07
  out.kurlarDesk = await withPage(browser, '/ihracat/kurlar', 1440, 900, async (p) => ({
    kpiBlocks: await p.evaluate(`(() => { ${HELPERS}
      return Array.from(document.querySelectorAll('[data-slot=card]')).filter(vis).map(el => (el.textContent??'').replace(/\\s+/g,' ').trim());
    })()`),
    yAxisTicks: await p.evaluate(`(() => { ${HELPERS}
      return Array.from(document.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value tspan, .recharts-yAxis text')).map(el => (el.textContent||'').trim()).filter(Boolean);
    })()`),
  }));

  // gtip-05/06
  out.gtipDesk = await withPage(browser, '/ihracat/gtip', 1440, 900, async (p) => ({
    kpis: await p.evaluate(`(() => { ${HELPERS}
      return Array.from(document.querySelectorAll('[data-slot=card]')).filter(vis).map(el => (el.textContent??'').replace(/\\s+/g,' ').trim());
    })()`),
    hsCol: await p.evaluate(`(() => { ${HELPERS}
      const rows = Array.from(document.querySelectorAll('tbody tr')).filter(vis);
      const vals = rows.map(r => (r.lastElementChild ? r.lastElementChild.textContent : '').replace(/\\s+/g,' ').trim());
      return { distinct: Array.from(new Set(vals)), count: vals.length };
    })()`),
  }));
  out.gtipMob = await withPage(browser, '/ihracat/gtip', 390, 844, async (p) => ({ cards: await p.evaluate(CARDS_INFO) }));

  // yeni-03
  out.yeniDesk = await withPage(browser, '/ihracat/sevkiyatlar/yeni', 1440, 900, async (p) => ({
    fields: await p.evaluate(`(() => { ${HELPERS}
      const boxes = Array.from(document.querySelectorAll('.max-w-3xl, .max-w-2xl')).filter(vis);
      return boxes.map(el => ({ cls: el.className, right: r1(el.getBoundingClientRect().right) }));
    })()`),
  }));

  await browser.close();
  const dir = resolve(process.cwd(), 'artifacts', 'critic');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'probe-ihracat-r3.json'), JSON.stringify(out, null, 1));
  console.log('ok', SHIP);
}

main().catch((e) => { console.error(e); process.exit(1); });
