/** Tur 4 — satır hover, focus-visible halkası, geçersiz gönderimde hata geri bildirimi. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';
const BASE = defaultBaseUrl();
async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route: '/ihracat/belgeler', as: 'admin' });
    out.rowClasses = await p.evaluate(`(() => { const r=document.querySelector('tbody tr'); return { cls:r.className, tdCls:r.firstElementChild.className }; })()`);
    await p.locator('tbody tr').nth(1).hover();
    await p.waitForTimeout(300);
    out.hoverBg = await p.evaluate(`(() => { const rs=Array.from(document.querySelectorAll('tbody tr')); return rs.slice(0,3).map(r=>getComputedStyle(r).backgroundColor + ' | td:' + getComputedStyle(r.firstElementChild).backgroundColor); })()`);
    // focus: ana içerikteki ilk butona tab'la
    await p.locator('main button, main a').first().focus();
    await p.keyboard.press('Tab');
    out.focus1 = await p.evaluate(`(() => { const a=document.activeElement; const s=getComputedStyle(a); return { el:(a.tagName+' '+(a.textContent||'').replace(/\\s+/g,' ').trim().slice(0,24)), outlineW:s.outlineWidth, outlineStyle:s.outlineStyle, outlineColor:s.outlineColor, offset:s.outlineOffset, boxShadow:s.boxShadow.slice(0,80) }; })()`);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route: '/ihracat/sevkiyatlar/yeni', as: 'admin' });
    await p.getByRole('button', { name: 'Sevkiyat oluştur' }).click();
    await p.waitForTimeout(1200);
    out.afterSubmit = await p.evaluate(`(() => ({
      url: location.pathname,
      redText: Array.from(document.querySelectorAll('main *')).filter(e=>e.children.length===0 && e.textContent.trim()).map(e=>({t:e.textContent.trim().slice(0,60), c:getComputedStyle(e).color})).filter(x=>/rgb\\(2[0-9][0-9]|rgb\\(1[5-9][0-9], *[0-5]/.test(x.c)).slice(0,6),
      invalid: document.querySelectorAll('[aria-invalid="true"]').length,
      toasts: Array.from(document.querySelectorAll('[data-sonner-toast],[role=alert],[role=status]')).map(t=>t.textContent.replace(/\\s+/g,' ').trim()),
      destructive: Array.from(document.querySelectorAll('main [class*=destructive]')).map(e=>e.textContent.replace(/\\s+/g,' ').trim().slice(0,60)),
    }))()`);
    await p.screenshot({ path: resolve(process.cwd(),'artifacts','screens','ihracat-sevkiyatlar-yeni','desktop-submit-empty.png'), fullPage: false });
    await ctx.close();
  }
  await browser.close();
  writeFileSync(resolve(process.cwd(),'artifacts','critic','probe-ihracat-r4c.json'), JSON.stringify(out,null,1));
  console.log(JSON.stringify(out,null,1));
}
main().catch(e=>{console.error(e);process.exit(1);});
