/** Tur 4 ek ölçüm — yeni form sipariş seçici, satır hover/focus, kur kartı etiketi. */
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
    await openRoute(p, { base: BASE, route: '/ihracat/sevkiyatlar/yeni', as: 'admin' });
    const trig = p.getByRole('combobox').first();
    await trig.click();
    await p.waitForTimeout(400);
    out.orderOptions = await p.evaluate(`Array.from(document.querySelectorAll('[role=option]')).map(i=>i.textContent.replace(/\\s+/g,' ').trim())`);
    await p.keyboard.press('Escape');
    out.formFields = await p.evaluate(`Array.from(document.querySelectorAll('main input, main textarea, main [role=combobox]')).map(e=>({tag:e.tagName, h:Math.round(e.getBoundingClientRect().height), w:Math.round(e.getBoundingClientRect().width), ph:e.getAttribute('placeholder')||null}))`);
    // submit without selection -> hata durumu
    await p.getByRole('button', { name: 'Sevkiyat oluştur' }).click();
    await p.waitForTimeout(900);
    out.submitEmptyFeedback = await p.evaluate(`({ toasts: Array.from(document.querySelectorAll('[data-sonner-toast], [role=status], [role=alert]')).map(t=>t.textContent.replace(/\\s+/g,' ').trim()), aria: Array.from(document.querySelectorAll('[aria-invalid=true]')).length, url: location.pathname })`);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const p = await ctx.newPage();
    await openRoute(p, { base: BASE, route: '/ihracat/belgeler', as: 'admin' });
    const row = p.locator('tbody tr').first();
    const before = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
    await row.hover();
    await p.waitForTimeout(250);
    const after = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
    out.rowHover = { before, after, changed: before !== after };
    await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
    out.focusRing = await p.evaluate(`(() => { const a=document.activeElement; const s=getComputedStyle(a); return { el:a.tagName+':'+(a.textContent||'').slice(0,20), outline:s.outlineWidth+' '+s.outlineStyle, boxShadow:s.boxShadow.slice(0,60) }; })()`);
    await ctx.close();
  }
  await browser.close();
  writeFileSync(resolve(process.cwd(), 'artifacts', 'critic', 'probe-ihracat-r4b.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });
