/** Tur 7 ek prob: sütun genişlikleri, tablo çerçevesi rengi, mobil versiyon seçici satırı. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const PID = process.argv[2] ?? '8c409d62-03a0-4829-91bf-82ca97a23484';

const FN = `(() => {
 const px=(n)=>Math.round(n*10)/10;
 const out={};
 const main=document.querySelector('main');
 // ızgara sütun genişlikleri
 const head = Array.from(main.querySelectorAll('[role="row"]')).find(r=>/Ürün/.test(r.textContent||'') && /Miktar/.test(r.textContent||''));
 if(head){ const cs=getComputedStyle(head); out.headCols = cs.gridTemplateColumns; out.headH = px(head.getBoundingClientRect().height); }
 const dataRow = Array.from(main.querySelectorAll('[role="row"]')).find(r=>r.querySelector('[role="cell"]'));
 if(dataRow){ out.rowCols = getComputedStyle(dataRow).gridTemplateColumns;
   out.cellWidths = Array.from(dataRow.querySelectorAll('[role="cell"]')).map(c=>({w:px(c.getBoundingClientRect().width), t:(c.textContent||'').trim().slice(0,18)}));
   out.rowHoverBg = getComputedStyle(dataRow).backgroundColor;
 }
 // tablo dış çerçevesi
 const tableBox = Array.from(main.querySelectorAll('div')).find(d=>/^ÜrünMiktar/.test((d.textContent||'').trim()));
 if(tableBox){ const cs=getComputedStyle(tableBox); const r=tableBox.getBoundingClientRect();
   out.tableBox={ w:px(r.width), h:px(r.height), borderTop:cs.borderTopWidth+' '+cs.borderTopStyle+' '+cs.borderTopColor, borderLeft:cs.borderLeftWidth+' '+cs.borderLeftColor, radius:cs.borderRadius, cls:(typeof tableBox.className==='string'?tableBox.className:'').slice(0,120) }; }
 // mobil versiyon seçici satırı
 const trig=document.querySelector('[data-slot="select-trigger"]');
 if(trig){ const r=trig.getBoundingClientRect(); const parent=trig.parentElement; const pr=parent.getBoundingClientRect();
   const sib=Array.from(parent.children).map(c=>({tag:c.tagName.toLowerCase(), w:px(c.getBoundingClientRect().width), t:(c.textContent||'').trim().slice(0,16)}));
   out.versionRow={ trigW:px(r.width), parentW:px(pr.width), siblings:sib, parentCls:(typeof parent.className==='string'?parent.className:'').slice(0,120) };
 }
 // kart içindeki toplam serbest yatay alan (versiyon satırı)
 return out;
})()`;

async function shoot(vp: any, route: string) {
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: vp.width < 500, hasTouch: vp.width < 500, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base: defaultBaseUrl(), route, as: 'arge' });
    const r = await page.evaluate(FN);
    await ctx.close();
    return r;
  } finally { await browser.close(); }
}
async function main() {
  const out: any = {};
  out.d1440 = await shoot({ width: 1440, height: 900 }, `/arge/projeler/${PID}/receteler`);
  out.d390 = await shoot({ width: 390, height: 844 }, `/arge/projeler/${PID}/receteler`);
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e)=>{console.error(e);process.exit(1);});
