/** Tur 7 ar-ge kritik ölçüm probu (string-eval; docs/DESIGN-SCORECARD.md kural 6). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = process.argv[2] ?? '8c409d62-03a0-4829-91bf-82ca97a23484';

const FN_PRECETE = `(() => {
 const px = (n) => Math.round(n*10)/10;
 const out = {};
 const rows = Array.from(document.querySelectorAll('[role="row"]'));
 out.roleRows = rows.length;
 const dataRows = rows.filter(r => r.querySelector('[role="cell"]'));
 out.rowHeights = dataRows.map(r => px(r.getBoundingClientRect().height));
 out.rowTexts = dataRows.map(r => (r.textContent||'').trim().slice(0,28));
 // Miktar sayı sağ kenarları (4 ondalıklı)
 const leaves = Array.from(document.querySelectorAll('main *')).filter(e => e.children.length===0);
 const qty = [];
 Array.from(document.querySelectorAll('main input')).forEach(i => { if(/^\\d+,\\d{4}$/.test(i.value||'')) qty.push({t:i.value, right:px(i.getBoundingClientRect().right)}); });
 leaves.forEach(e => { const t=(e.textContent||'').trim(); if(/^\\d+,\\d{4}$/.test(t)) qty.push({t, right:px(e.getBoundingClientRect().right)}); });
 out.qtyRights = qty;
 // Ürün adı kırpma
 out.nameCells = dataRows.map(r => {
   const s = r.querySelector('span.truncate, span[class*="truncate"]');
   if(!s) return null;
   const b = s.getBoundingClientRect();
   return { t:(s.textContent||'').trim(), boxW:px(b.width), scrollW:s.scrollWidth, truncated:s.scrollWidth>Math.ceil(b.width)+1, left:px(b.left), right:px(b.right) };
 });
 // ürün hücresi (role=cell ilk) genişliği ve içindeki ölü alan
 out.productCells = dataRows.map(r => { const c=r.querySelector('[role="cell"]'); const b=c.getBoundingClientRect(); return {w:px(b.width), left:px(b.left), right:px(b.right)}; });
 // SKU kutuları
 out.skus = dataRows.map(r => { const s=r.querySelector('[class*="font-mono"]'); return s? {t:(s.textContent||'').trim(), left:px(s.getBoundingClientRect().left), right:px(s.getBoundingClientRect().right)}:null; });
 // görünür dikdörtgenler (kenarlık VEYA gölge) ana kart içinde
 const main = document.querySelector('main');
 const card = Array.from(main.querySelectorAll('div')).find(d => { const c = typeof d.className==='string'?d.className:''; return /rounded-xl/.test(c) && /border/.test(c); });
 const res = {borderOnly:0, shadowOnly:0, both:0, list:[]};
 if(card){
  card.querySelectorAll('*').forEach(e => {
    const cs=getComputedStyle(e); const r=e.getBoundingClientRect();
    if(r.width<=20||r.height<=16) return;
    const bws=['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].map(k=>parseFloat(cs[k]));
    const hasBorder = bws.every(v=>v>0);
    const sh=cs.boxShadow; const hasShadow = sh!=='none' && !/^rgba\\(0, 0, 0, 0\\)/.test(sh);
    if(hasBorder&&hasShadow) res.both++; else if(hasBorder) res.borderOnly++; else if(hasShadow) res.shadowOnly++;
    if(hasBorder||hasShadow) res.list.push({tag:e.tagName.toLowerCase(), v:(e.value!==undefined?String(e.value):(e.textContent||'').trim()).slice(0,14), w:Math.round(r.width), h:Math.round(r.height), b:hasBorder, s:hasShadow?sh.slice(0,34):null});
  });
  res.total=res.borderOnly+res.shadowOnly+res.both;
  out.cardTop = px(card.getBoundingClientRect().top + window.scrollY);
  if(dataRows[0]) out.cardTopToFirstRow = px(dataRows[0].getBoundingClientRect().top + window.scrollY - (card.getBoundingClientRect().top + window.scrollY));
  out.cardW = px(card.getBoundingClientRect().width);
 }
 out.rects = res;
 out.docScrollH = document.documentElement.scrollHeight;
 out.innerH = window.innerHeight;
 // ilk ekranda görünen malzeme satırı sayısı
 out.rowsInFirstScreen = dataRows.filter(r => r.getBoundingClientRect().bottom <= window.innerHeight).length;
 // mobil özet satırı metinleri
 out.mobileSummaries = Array.from(document.querySelectorAll('main p')).map(p=>(p.textContent||'').trim()).filter(t=>/·/.test(t)).slice(0,8);
 // select trigger kırpma
 out.selectTriggers = Array.from(document.querySelectorAll('[data-slot="select-trigger"]')).map(t=>{
   const sp=t.querySelector('span')||t; const b=sp.getBoundingClientRect();
   return {text:(t.textContent||'').trim().slice(0,24), boxW:px(b.width), scrollW:sp.scrollWidth, truncated:sp.scrollWidth>Math.ceil(b.width)+1};
 });
 // sabit alt çubuk ve içerik boşluğu
 const fixed = Array.from(document.querySelectorAll('body *')).filter(e=>{const cs=getComputedStyle(e); const r=e.getBoundingClientRect(); return cs.position==='fixed' && r.width>300 && r.height>40 && Math.abs(r.bottom-window.innerHeight)<3;});
 out.bottomBar = fixed.slice(0,2).map(e=>({h:px(e.getBoundingClientRect().height), cls:(typeof e.className==='string'?e.className:'').slice(0,60)}));
 const mainEl=document.querySelector('main'); if(mainEl){const cs=getComputedStyle(mainEl); out.mainPadBottom=cs.paddingBottom;}
 // hedef bandı yüksekliği
 const hedef = Array.from(main.querySelectorAll('div')).find(d=>/Hedef maliyete göre/.test(d.textContent||'') && d.getBoundingClientRect().height<200 && d.getBoundingClientRect().height>40);
 if(hedef) out.hedefBandH = px(hedef.getBoundingClientRect().height);
 return out;
})()`;

const FN_LIST = `(() => {
 const px=(n)=>Math.round(n*10)/10;
 const tr=document.querySelector('tbody tr'); const li=document.querySelector('main ul > li');
 const el=tr||li; const main=document.querySelector('main');
 if(!el) return {firstRow:null};
 const r=el.getBoundingClientRect();
 const out={ firstRowViewportTop:px(r.top), firstRowMainOffset: main?px(r.top-main.getBoundingClientRect().top):null, rowH:px(r.height) };
 // birim maliyet renkleri
 out.costColors = Array.from(document.querySelectorAll('tbody tr')).map(row=>{
   const c = Array.from(row.querySelectorAll('*')).find(e=>e.children.length===0 && /^₺/.test((e.textContent||'').trim()));
   return c ? {t:(c.textContent||'').trim(), color:getComputedStyle(c).color, right:px(c.getBoundingClientRect().right)} : null;
 });
 // mobil kart meta ayracı
 const card=document.querySelector('main ul > li');
 if(card){
   const subs=Array.from(card.querySelectorAll('*')).filter(e=>e.children.length===0).map(e=>({t:(e.textContent||'').trim(), left:px(e.getBoundingClientRect().left), right:px(e.getBoundingClientRect().right)}));
   out.mobileCardLeaves = subs;
 }
 return out;
})()`;

async function shoot(vp: { width: number; height: number }, route: string, fn: string) {
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: vp.width < 500, hasTouch: vp.width < 500, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route, as: 'arge' });
    const r = await page.evaluate(fn);
    await ctx.close();
    return r;
  } finally { await browser.close(); }
}

async function main() {
  const out: any = {};
  out.precete_1440 = await shoot({ width: 1440, height: 900 }, `/arge/projeler/${PID}/receteler`, FN_PRECETE);
  out.precete_390 = await shoot({ width: 390, height: 844 }, `/arge/projeler/${PID}/receteler`, FN_PRECETE);
  out.projeler_1440 = await shoot({ width: 1440, height: 900 }, '/arge/projeler', FN_LIST);
  out.projeler_390 = await shoot({ width: 390, height: 844 }, '/arge/projeler', FN_LIST);
  out.receteler_1440 = await shoot({ width: 1440, height: 900 }, '/arge/receteler', FN_LIST);
  out.receteler_390 = await shoot({ width: 390, height: 844 }, '/arge/receteler', FN_LIST);
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
