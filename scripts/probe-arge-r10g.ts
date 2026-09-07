/**
 * Tur 10 düzeltme doğrulaması (arge-recete-40 P1, arge-board-16 P2): 390px'te reçete satır
 * hizası (B. maliyet cy vs Kaynak cy) + board kartı focus-visible ring.
 */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = process.env.PID ?? '';
const base = defaultBaseUrl();

async function main() {
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // --- 390: reçete satır hizası (arge-recete-40)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR', isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/arge/projeler/${PID}/receteler`, as: 'admin' });
    // Tur 10 kritik ölçümü tam olarak "Fıstık Bazı" reçetesinin v1 · Taslak versiyonuydu (bulgudaki
    // "RD-2026-000001 v1 · Taslak" etiketi) — bu projede birden çok deneme reçetesi olduğundan ilk
    // yüklenen varsayılan farklı olabilir; reçete/versiyon seçicilerinden doğru kayda geçilir.
    const recipeTrigger = page.getByLabel('Reçete', { exact: true });
    if (await recipeTrigger.count()) {
      await recipeTrigger.click();
      await page.getByRole('option', { name: 'Fıstık Bazı', exact: true }).click();
      await page.waitForTimeout(200);
    }
    const versionTrigger = page.getByLabel('Versiyon', { exact: true });
    if (await versionTrigger.count()) {
      await versionTrigger.click();
      await page.getByRole('option', { name: /^v1 ·/ }).click();
      await page.waitForTimeout(200);
    }
    out.precete_390_rowAlign = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[role="row"]')].filter((r) => r.querySelector('[role="cell"]'));
      const result: Array<{ row: string; kaynak: { text: string; cy: number } | null; bMaliyet: { text: string; cy: number } | null }> = [];
      for (const r of rows) {
        // Görünür (offsetParent !== null) [role=cell] elemanları belge sırasıyla: [0]=Ürün, [1]=Miktar,
        // [2]=Kaynak, [3]=B. maliyet, [4]=Fire % (masaüstü-yalnız "Satır maliyeti" hücresi mobilde
        // `hidden` — offsetParent null, listeye girmez).
        const cells = ([...r.querySelectorAll('[role="cell"]')] as HTMLElement[]).filter((c) => c.offsetParent !== null);
        const kaynakCell = cells[2];
        const bMaliyetCell = cells[3];
        let kaynak = null as { text: string; cy: number } | null;
        let bMaliyet = null as { text: string; cy: number } | null;
        if (kaynakCell) {
          let control: HTMLElement | undefined;
          for (const ch of Array.from(kaynakCell.children)) {
            if ((ch as HTMLElement).offsetParent !== null) { control = ch as HTMLElement; break; }
          }
          const target = control ?? kaynakCell;
          const rr = target.getBoundingClientRect();
          if (rr.height > 0) kaynak = { text: (kaynakCell.textContent ?? '').trim().slice(0, 16), cy: Math.round(rr.top + rr.height / 2) };
        }
        if (bMaliyetCell) {
          let control: HTMLElement | undefined;
          for (const ch of Array.from(bMaliyetCell.children)) {
            if ((ch as HTMLElement).offsetParent !== null) { control = ch as HTMLElement; break; }
          }
          const target = control ?? bMaliyetCell;
          const rr = target.getBoundingClientRect();
          if (rr.height > 0) bMaliyet = { text: (bMaliyetCell.textContent ?? '').trim().slice(0, 16), cy: Math.round(rr.top + rr.height / 2) };
        }
        if (kaynak && bMaliyet) result.push({ row: (r.textContent ?? '').trim().slice(0, 18), kaynak, bMaliyet });
      }
      return result;
    });
    // ₺ prefix boşluğu (arge-recete-41 — bilgi amaçlı, shared component kapsamı)
    out.precete_390_prefixGap = await page.evaluate(() => {
      const wrappers = [...document.querySelectorAll('div.relative.flex.items-center')] as HTMLElement[];
      return wrappers
        .map((w) => {
          const prefix = w.querySelector('span.pointer-events-none') as HTMLElement | null;
          const input = w.querySelector('input') as HTMLInputElement | null;
          if (!prefix || !input || !/₺/.test(prefix.textContent ?? '')) return null;
          const pr = prefix.getBoundingClientRect();
          const val = input.value;
          if (!val) return null;
          // İlk rakamın yaklaşık x'i: input right - (karakter sayısı * ort. karakter genişliği)
          return { value: val, prefixRight: Math.round(pr.right), inputRight: Math.round(input.getBoundingClientRect().right) };
        })
        .filter(Boolean);
    });
    // Görsel kanıt (düzeltme sonrası) — Tur 10'daki arge-r10-precete-390-satirlar.png ile aynı kırpma.
    const box = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[role="row"]')].filter((r) => /Badem|Hurma|Deniz|Kavanoz/.test(r.textContent ?? ''));
      const first = rows[0]!.getBoundingClientRect();
      const last = rows[rows.length - 1]!.getBoundingClientRect();
      return { x: Math.round(first.left) - 8, y: Math.round(first.top) - 8, width: Math.round(first.width) + 16, height: Math.round(last.bottom - first.top) + 16 };
    });
    await page.screenshot({ path: 'artifacts/critic/arge-r10-precete-390-satirlar-after.png', clip: box });
    await ctx.close();
  }

  // --- 1440: board kartı focus-visible ring (arge-board-16) — CDP forcePseudoState (r10f ile aynı desen)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'tr-TR' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route: `/arge/projeler/${PID}/board`, as: 'admin' });
    const cdp = await ctx.newCDPSession(page);
    const { root } = (await cdp.send('DOM.getDocument', { depth: -1 })) as { root: { nodeId: number } };
    await cdp.send('CSS.enable');

    const el = page.locator('button.min-h-11.rounded-lg').first();
    await el.evaluate((e) => e.setAttribute('id', 'probe-card'));
    const { nodeId } = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#probe-card' })) as { nodeId: number };
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['focus', 'focus-visible'] });
    await page.waitForTimeout(150);
    out.board_1440_cardFocus = await el.evaluate((e) => {
      const cs = getComputedStyle(e);
      return { outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, boxShadow: cs.boxShadow, borderColor: cs.borderColor };
    });
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });

    // "Kart ekle" butonu — aynı odak dili karşılaştırması
    const addBtn = page.locator('button', { hasText: 'Kart ekle' }).first();
    await addBtn.evaluate((e) => e.setAttribute('id', 'probe-addbtn'));
    const { nodeId: addNodeId } = (await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#probe-addbtn' })) as { nodeId: number };
    await cdp.send('CSS.forcePseudoState', { nodeId: addNodeId, forcedPseudoClasses: ['focus', 'focus-visible'] });
    await page.waitForTimeout(150);
    out.board_1440_addBtnFocus = await addBtn.evaluate((e) => {
      const cs = getComputedStyle(e);
      return { outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`, boxShadow: cs.boxShadow };
    });
    await cdp.send('CSS.forcePseudoState', { nodeId: addNodeId, forcedPseudoClasses: [] });

    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
