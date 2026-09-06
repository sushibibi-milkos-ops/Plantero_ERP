import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const BASE = defaultBaseUrl();
const SHIP = '03241adc-54f8-480a-ba87-45d5f5fe2eb0';

async function withPage<T>(browser: Browser, route: string, w: number, h: number, fn: (p: Page) => Promise<T>): Promise<T> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  const page = await ctx.newPage();
  await openRoute(page, { base: BASE, route, as: 'admin' });
  const out = await fn(page);
  await ctx.close();
  return out;
}

const KPI = `(() => {
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0') return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
  const out = [];
  document.querySelectorAll('[data-slot="kpi-card"],[data-kpi],[class*="kpi"]').forEach(el => { if (vis(el)) out.push({ cls: (typeof el.className==='string'?el.className:'').slice(0,60), t: (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,60) }); });
  // fallback: kpi strip row children
  const strip = document.querySelector('[data-slot="kpi-strip"]') || null;
  const stripKids = strip ? Array.from(strip.children).map(k => ({ t: (k.textContent||'').replace(/\\s+/g,' ').trim().slice(0,60) })) : null;
  // değer düğümlerinin rengi
  const vals = [];
  document.querySelectorAll('*').forEach(el => {
    if (el.children.length) return; if (!vis(el)) return;
    const t = (el.textContent||'').trim();
    if (!/^[₺€$]?[\\d.,]+$|^—$/.test(t)) return;
    const r = el.getBoundingClientRect();
    if (r.top > 400) return;
    vals.push({ t, fs: getComputedStyle(el).fontSize, fw: getComputedStyle(el).fontWeight, color: getComputedStyle(el).color, fvn: getComputedStyle(el).fontVariantNumeric, y: Math.round(r.top) });
  });
  return { out, stripKids, vals };
})()`;

const SEP = `(() => {
  const res = [];
  document.querySelectorAll('span[aria-hidden]').forEach(el => {
    if ((el.textContent||'') !== ' \\u00b7 ' && (el.textContent||'').trim() !== '\\u00b7') return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rect = range.getBoundingClientRect();
    const prev = el.parentElement && el.parentElement.previousElementSibling;
    let prevRight = null;
    if (prev) { const r2 = document.createRange(); r2.selectNodeContents(prev); prevRight = r2.getBoundingClientRect().right; }
    res.push({ text: JSON.stringify(el.textContent), sepLeft: Math.round(rect.left*10)/10, sepRight: Math.round(rect.right*10)/10, prevRight: prevRight===null?null:Math.round(prevRight*10)/10, gapBefore: prevRight===null?null:Math.round((rect.left-prevRight)*10)/10 });
  });
  return res.slice(0, 6);
})()`;

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  out.kurlarKpi = await withPage(browser, '/ihracat/kurlar', 1440, 900, (p) => p.evaluate(KPI));
  out.belgelerKpi = await withPage(browser, '/ihracat/belgeler', 1440, 900, (p) => p.evaluate(KPI));
  out.gtipKpi = await withPage(browser, '/ihracat/gtip', 1440, 900, (p) => p.evaluate(KPI));
  out.listSep = await withPage(browser, '/ihracat/sevkiyatlar', 390, 844, (p) => p.evaluate(SEP));
  out.faturaKur = await withPage(browser, `/ihracat/sevkiyatlar/${SHIP}`, 1440, 900, async (p) => {
    await p.getByRole('tab', { name: 'Fatura & kur' }).click();
    await p.waitForTimeout(400);
    return p.evaluate(`(() => {
      const panel = document.querySelector('[role="tabpanel"]:not([hidden])');
      return { text: (panel ? panel.textContent : '').replace(/\\s+/g,' ').trim().slice(0,600), html: (panel ? panel.innerHTML : '').slice(0,1500) };
    })()`);
  });
  out.detayBelgelerCards = await withPage(browser, `/ihracat/sevkiyatlar/${SHIP}`, 390, 844, async (p) => {
    await p.getByRole('tab', { name: 'Belgeler' }).click();
    await p.waitForTimeout(400);
    return p.evaluate(`(() => {
      const lis = Array.from(document.querySelectorAll('li')).filter(li => li.offsetHeight > 0 && /Proforma|Ticari|Çeki|ETGB|sigorta|sertifika|Konşimento/.test(li.textContent||''));
      return lis.slice(0,4).map(li => ({ h: Math.round(li.getBoundingClientRect().height*10)/10, t: (li.textContent||'').replace(/\\s+/g,' ').trim().slice(0,70), html: li.innerHTML.slice(0,300) }));
    })()`);
  });
  await browser.close();
  const dir = resolve(process.cwd(), 'artifacts', 'critic');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'probe-ihracat-r2b.json'), JSON.stringify(out, null, 1));
  console.log('ok');
}
main().catch((e) => { console.error(e); process.exit(1); });
