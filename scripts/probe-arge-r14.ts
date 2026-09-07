/** Tur 14 kritik ölçümü — arge modülü (salt okuma). */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const PID = '9276cfa2-4a0e-42d9-9dd0-22d116cdcc0a';
const base = defaultBaseUrl();

const OFFSET = () => {
  const main = document.querySelector('main');
  const row = document.querySelector('tbody tr') ?? document.querySelector('main ul > li');
  const h1 = document.querySelector('h1');
  const thead = document.querySelector('thead tr');
  if (!main || !row) return null;
  const m = main.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  const cs = h1 ? getComputedStyle(h1) : null;
  return {
    firstRowTop_viewport: Math.round(r.top),
    firstRowTop_mainOffset: Math.round(r.top - m.top),
    rowHeight: Math.round(r.height * 10) / 10,
    h1: cs ? `${cs.fontSize}/${cs.fontWeight}` : null,
    h1Top_mainOffset: h1 ? Math.round(h1.getBoundingClientRect().top - m.top) : null,
    theadTop_mainOffset: thead ? Math.round(thead.getBoundingClientRect().top - m.top) : null,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  };
};

const MONEY = () => {
  const res: unknown[] = [];
  for (const td of [...document.querySelectorAll('tbody tr td, main ul > li')]) {
    const txt = (td.textContent ?? '').trim();
    if (!txt.includes('₺')) continue;
    // para taşıyan en iç elemanı bul
    const cands = [...td.querySelectorAll('*')].filter((e) => (e.textContent ?? '').trim().startsWith('₺') && e.children.length === 0);
    for (const el of cands) {
      const cs = getComputedStyle(el as HTMLElement);
      res.push({
        t: (el.textContent ?? '').trim(),
        color: cs.color,
        fvn: cs.fontVariantNumeric,
        textAlign: getComputedStyle(el.parentElement as HTMLElement).textAlign,
        title: (el as HTMLElement).title || (el.closest('[title]') as HTMLElement | null)?.title || null,
        aria: el.getAttribute('aria-label') || (el.closest('[aria-label]') as HTMLElement | null)?.getAttribute('aria-label') || null,
        srOnly: (el.parentElement?.querySelector('.sr-only')?.textContent ?? null),
      });
    }
  }
  const mainText = (document.querySelector('main')?.textContent ?? '').toLowerCase();
  return { cells: res, hasHedefWord: mainText.includes('hedef') };
};

const SOLID_ACCENT = () => {
  const res: unknown[] = [];
  for (const b of [...document.querySelectorAll('button, a[data-slot="button"]')]) {
    const r = b.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const bg = getComputedStyle(b).backgroundColor;
    let green = false;
    const m = /oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(bg);
    if (m) green = Number(m[2]) > 0.08 && Number(m[3]) > 120 && Number(m[3]) < 190;
    const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
    if (rgb) { const g = Number(rgb[2]); green = g > Number(rgb[1]) + 25 && g > Number(rgb[3]) + 25; }
    if (green) res.push({ text: (b.textContent ?? '').trim().slice(0, 30) || b.getAttribute('aria-label'), bg, w: Math.round(r.width), h: Math.round(r.height) });
  }
  return res;
};

/** cost-simulator: ₺ öneki ile ilk rakam arası boşluk (px) */
const PREFIX_GAP = () => {
  const res: unknown[] = [];
  // ₺ tek başına duran elemanlar
  for (const el of [...document.querySelectorAll('span, div')]) {
    if (el.children.length !== 0) continue;
    if ((el.textContent ?? '').trim() !== '₺') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    // aynı satırdaki input/değer
    const wrap = el.parentElement;
    const input = wrap?.querySelector('input') as HTMLInputElement | null;
    if (!input) { res.push({ kind: 'prefix-no-input', x: Math.round(r.right) }); continue; }
    const ir = input.getBoundingClientRect();
    const cs = getComputedStyle(input);
    // sağa yaslı input: metin sağ kenarda; metin genişliğini canvas ile ölç
    const c = document.createElement('canvas').getContext('2d')!;
    c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const w = c.measureText(input.value).width;
    const textLeft = ir.right - parseFloat(cs.paddingRight) - w;
    res.push({ kind: 'input', value: input.value, prefixRight: Math.round(r.right * 10) / 10, textLeft: Math.round(textLeft * 10) / 10, gap: Math.round((textLeft - r.right) * 10) / 10 });
  }
  // inline ₺ değerler (₺120,00)
  const inline: string[] = [];
  for (const el of [...document.querySelectorAll('span, div, td')]) {
    if (el.children.length !== 0) continue;
    const t = (el.textContent ?? '').trim();
    if (/^₺\d/.test(t)) inline.push(t);
  }
  return { prefixes: res, inlineSamples: inline.slice(0, 12) };
};

/** 390px fire alanı görünür etiket/birim */
const FIRE = () => {
  const inputs = [...document.querySelectorAll('input')].filter((i) => {
    const r = i.getBoundingClientRect();
    return r.width > 0 && r.width < 90 && /^\d{1,2}$/.test(i.value);
  }).map((i) => {
    const r = i.getBoundingClientRect();
    return { value: i.value, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), aria: i.getAttribute('aria-label'), title: i.title };
  });
  const mainText = (document.querySelector('main')?.textContent ?? '');
  const fireMarks = (mainText.match(/Fire/g) ?? []).length;
  return { inputs, fireMarks };
};

const TOUCH = () => {
  const res: unknown[] = [];
  const sel = 'button, a, input, select, textarea, [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"])';
  for (const el of [...document.querySelectorAll(sel)]) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
    if (r.width < 44 || r.height < 44) {
      res.push({ sel: el.tagName.toLowerCase() + (el.getAttribute('data-slot') ? `[${el.getAttribute('data-slot')}]` : ''), t: (el.textContent ?? '').trim().slice(0, 24) || el.getAttribute('aria-label'), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
    }
  }
  return res;
};

const FONTS = () => {
  const map: Record<string, number> = {};
  for (const el of [...document.querySelectorAll('main *')]) {
    if (el.children.length !== 0) continue;
    const t = (el.textContent ?? '').trim();
    if (!t) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = String(Math.round(parseFloat(getComputedStyle(el).fontSize)));
    map[s] = (map[s] ?? 0) + 1;
  }
  return map;
};

const COLORS = () => {
  const set = new Set<string>();
  let n = 0;
  for (const el of [...document.querySelectorAll('*')]) {
    if (n++ > 400) break;
    const cs = getComputedStyle(el);
    if (cs.color) set.add(cs.color);
    if (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)/.test(cs.backgroundColor)) set.add(cs.backgroundColor);
  }
  return set.size;
};

async function page(route: string, vp: { width: number; height: number }) {
  const browser = (globalThis as any).__b as Awaited<ReturnType<typeof launchBrowser>>;
  const ctx = await browser.newContext({ viewport: vp, locale: 'tr-TR', isMobile: vp.width < 500, hasTouch: vp.width < 500 });
  const p = await ctx.newPage();
  await openRoute(p, { base, route, as: 'admin' });
  return { p, ctx };
}

async function run() {
  (globalThis as any).__b = await launchBrowser();
  const out: Record<string, unknown> = {};

  for (const [key, route] of [['projeler', '/arge/projeler'], ['receteler', '/arge/receteler']] as const) {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const { p, ctx } = await page(route, vp);
      const tag = `${key}_${vp.width}`;
      out[`${tag}_offset`] = await p.evaluate(OFFSET);
      out[`${tag}_money`] = await p.evaluate(MONEY);
      out[`${tag}_fonts`] = await p.evaluate(FONTS);
      out[`${tag}_colors`] = await p.evaluate(COLORS);
      if (vp.width === 390) out[`${tag}_touch`] = await p.evaluate(TOUCH);
      if (vp.width === 1440) {
        // satır hover + focus
        const tr = p.locator('tbody tr').first();
        await tr.hover();
        await p.waitForTimeout(250);
        out[`${tag}_hover`] = await p.evaluate(() => {
          const el = document.querySelector('tbody tr:hover') as HTMLElement | null;
          return el ? getComputedStyle(el).backgroundColor : 'yok';
        });
        out[`${tag}_rowHeights`] = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map((r) => Math.round(r.getBoundingClientRect().height * 10) / 10));
        // th/td sağ kenar hizası
        out[`${tag}_align`] = await p.evaluate(() => {
          const ths = [...document.querySelectorAll('thead th')].map((t) => ({ t: (t.textContent ?? '').trim(), r: Math.round(t.getBoundingClientRect().right) }));
          const tds = [...document.querySelectorAll('tbody tr')].slice(0, 1).flatMap((tr) => [...tr.querySelectorAll('td')].map((t) => Math.round(t.getBoundingClientRect().right)));
          return { ths, tds };
        });
      } else {
        out[`${tag}_cardHeights`] = await p.evaluate(() => [...document.querySelectorAll('main ul > li')].map((r) => Math.round(r.getBoundingClientRect().height * 10) / 10));
      }
      await ctx.close();
    }
  }

  // proje reçeteleri (cost simulator)
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const { p, ctx } = await page(`/arge/projeler/${PID}/receteler`, vp);
    const tag = `precete_${vp.width}`;
    out[`${tag}_solidAccent`] = await p.evaluate(SOLID_ACCENT);
    out[`${tag}_prefixGap`] = await p.evaluate(PREFIX_GAP);
    out[`${tag}_fire`] = await p.evaluate(FIRE);
    out[`${tag}_fonts`] = await p.evaluate(FONTS);
    out[`${tag}_colors`] = await p.evaluate(COLORS);
    out[`${tag}_overflow`] = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (vp.width === 390) out[`${tag}_touch`] = await p.evaluate(TOUCH);
    await ctx.close();
  }

  // board
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const { p, ctx } = await page(`/arge/projeler/${PID}/board`, vp);
    const tag = `board_${vp.width}`;
    out[`${tag}_overflow`] = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    out[`${tag}_fonts`] = await p.evaluate(FONTS);
    out[`${tag}_colors`] = await p.evaluate(COLORS);
    out[`${tag}_solidAccent`] = await p.evaluate(SOLID_ACCENT);
    if (vp.width === 390) out[`${tag}_touch`] = await p.evaluate(TOUCH);
    await ctx.close();
  }

  await (globalThis as any).__b.close();
  process.stdout.write(JSON.stringify(out, null, 1));
}

run().catch((e) => { console.error(e); process.exit(1); });
