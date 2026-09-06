/**
 * Tur 2 (düzeltme sonrası kanıt) — /arge/projeler/[id]/receteler ve /board.
 * Ölçer: kırpılan sayısal input'lar (scrollWidth>clientWidth), tablo gövdesinde dinlenme
 * halinde görünür kenarlıklı kontrol sayısı, satır yüksekliği, hedef çubuğu boyutu/rengi,
 * breadcrumb metni (receteler route); board kolon yükseklikleri + scroller boyutu + mini-nav.
 */
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

const base = defaultBaseUrl();
const PROJECT_ID = process.argv[2] ?? 'da3fd290-e3db-4d92-b5f9-3297ba43268a';

const RECETE_SRC = `(() => {
  var out = { clippedInputs: [], borderedControlsInTable: 0, rowHeights: [], targetBar: null, breadcrumb: [] };
  var table = document.querySelector('main table');
  if (table) {
    var inputs = Array.prototype.slice.call(table.querySelectorAll('input'));
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var rect = el.getBoundingClientRect();
      if (rect.width === 0) continue;
      if (el.scrollWidth > el.clientWidth) out.clippedInputs.push({ value: el.value, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
    var controls = Array.prototype.slice.call(table.querySelectorAll('tbody input, tbody button[role="combobox"], tbody [data-slot="select-trigger"]'));
    for (var j = 0; j < controls.length; j++) {
      var cs = getComputedStyle(controls[j]);
      var bw = parseFloat(cs.borderTopWidth) || 0;
      var bc = cs.borderTopColor;
      var visible = bw > 0 && bc && bc.indexOf('rgba(0, 0, 0, 0)') === -1 && cs.borderTopStyle !== 'none';
      if (visible) out.borderedControlsInTable++;
    }
    var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
    out.rowHeights = rows.map(function (r) { return Math.round(r.getBoundingClientRect().height * 10) / 10; });
  }
  var barTrack = document.querySelector('main .h-1.overflow-hidden.rounded-full.bg-muted');
  if (barTrack) {
    var fill = barTrack.firstElementChild;
    var tr = barTrack.getBoundingClientRect();
    var fr = fill ? fill.getBoundingClientRect() : null;
    out.targetBar = {
      trackW: Math.round(tr.width), trackH: Math.round(tr.height),
      fillW: fr ? Math.round(fr.width) : null,
      fillBg: fill ? getComputedStyle(fill).backgroundColor : null,
    };
  }
  var crumbs = Array.prototype.slice.call(document.querySelectorAll('[data-slot="breadcrumb-link"], [data-slot="breadcrumb-page"]'));
  out.breadcrumb = crumbs.map(function (c) { return (c.textContent || '').trim(); });
  return out;
})()`;

const BOARD_SRC = `(() => {
  var scroller = document.querySelector('main .snap-x');
  var out = { scroller: null, columnHeights: [], miniNav: [], tabLabels: [] };
  if (scroller) {
    var r = scroller.getBoundingClientRect();
    out.scroller = { h: Math.round(r.height), scrollW: Math.round(scroller.scrollWidth), clientW: Math.round(scroller.clientWidth) };
    var cols = Array.prototype.slice.call(scroller.querySelectorAll(':scope > div > div'));
    out.columnHeights = cols.map(function (c) { return Math.round(c.getBoundingClientRect().height); });
  }
  var pills = Array.prototype.slice.call(document.querySelectorAll('main button')).filter(function (b) {
    return /\\d+$/.test((b.textContent || '').trim()) && b.closest('.snap-x') === null;
  });
  out.miniNav = pills.slice(0, 8).map(function (b) { var r = b.getBoundingClientRect(); return { text: (b.textContent || '').trim(), w: Math.round(r.width), h: Math.round(r.height) }; });
  var tabs = Array.prototype.slice.call(document.querySelectorAll('a')).filter(function (a) { return a.getAttribute('href') && /\\/(board|receteler)$/.test(a.getAttribute('href')); });
  out.tabLabels = tabs.map(function (a) { return (a.textContent || '').trim(); });
  return out;
})()`;

async function run(route: string, src: string, viewport: { width: number; height: number }, clickV1 = false) {
  const browser = await launchBrowser();
  try {
    const isMobile = viewport.width < 768;
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile, hasTouch: isMobile, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const page = await ctx.newPage();
    await openRoute(page, { base, route, as: 'arge' });
    if (clickV1) {
      // v2 (released) DÜZENLENEMEZ — salt-okunur metin gösterir, gerçek input/kenarlık ölçümü
      // için editable v1 (draft) versiyonuna geçilir.
      await page.getByText('v1', { exact: true }).click();
      await page.waitForTimeout(400);
    }
    const data = await page.evaluate(src);
    await ctx.close();
    return data;
  } finally {
    await browser.close();
  }
}

async function main() {
  const receteRoute = `/arge/projeler/${PROJECT_ID}/receteler`;
  const boardRoute = `/arge/projeler/${PROJECT_ID}/board`;
  const result = {
    receteler_1440: await run(receteRoute, RECETE_SRC, { width: 1440, height: 900 }, true),
    receteler_390: await run(receteRoute, RECETE_SRC, { width: 390, height: 844 }, true),
    board_1440: await run(boardRoute, BOARD_SRC, { width: 1440, height: 900 }),
    board_390: await run(boardRoute, BOARD_SRC, { width: 390, height: 844 }),
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
