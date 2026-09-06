/** Tur 6b — OEE mobil aktif-nokta tekrarlanabilirliği, /bakim/is-emirleri/yeni 390 alt geometri, kanban görünümü. */
import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

const DOTS = `(() => {
  var dots = Array.prototype.slice.call(document.querySelectorAll('.recharts-active-dot')).map(function (d) {
    var r = d.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), fill: (d.querySelector('circle') || d).getAttribute('fill') };
  });
  var cursors = document.querySelectorAll('.recharts-tooltip-cursor').length;
  return { count: dots.length, dots: dots, cursors: cursors };
})()`;

const YENI = `(() => {
  var pick = function (sel) { var e = document.querySelector(sel); if (!e) return null; var r = e.getBoundingClientRect(); return { top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), h: Math.round(r.height) }; };
  var form = document.querySelector('form');
  var lastField = null;
  if (form) {
    var kids = Array.prototype.slice.call(form.querySelectorAll('input,button,textarea,label'));
    for (var i = 0; i < kids.length; i++) { var r = kids[i].getBoundingClientRect(); if (r.height > 0 && (!lastField || r.bottom + window.scrollY > lastField)) lastField = Math.round(r.bottom + window.scrollY); }
  }
  var cs = form ? getComputedStyle(form) : null;
  return {
    docHeight: Math.round(document.documentElement.scrollHeight),
    innerHeight: window.innerHeight,
    form: pick('form'),
    formPaddingBottom: cs ? cs.paddingBottom : null,
    lastFieldBottom: lastField,
    stickyBar: pick('form + div, [class*="sticky"][class*="bottom"]'),
    main: pick('main'),
    mainPaddingBottom: (function () { var m = document.querySelector('main'); return m ? getComputedStyle(m).paddingBottom : null; })(),
    deadTail: Math.round(document.documentElement.scrollHeight - (lastField || 0))
  };
})()`;

const COLORS = `(() => {
  var set = {};
  var els = Array.prototype.slice.call(document.querySelectorAll('main *')).slice(0, 500);
  for (var i = 0; i < els.length; i++) {
    var st = getComputedStyle(els[i]);
    var r = els[i].getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if ((els[i].textContent || '').trim()) set[st.color] = (set[st.color] || 0) + 1;
    if (st.backgroundColor && st.backgroundColor !== 'rgba(0, 0, 0, 0)') set['bg:' + st.backgroundColor] = (set['bg:' + st.backgroundColor] || 0) + 1;
  }
  return set;
})()`;

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { route: '/bakim/oee', base, as: 'admin' });
    console.log(JSON.stringify({ probe: 'oee-activedots', run: i + 1, ...(await p.evaluate(DOTS) as object) }));
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { route: '/bakim/oee', base, as: 'admin' });
    console.log(JSON.stringify({ probe: 'oee-activedots-desktop', ...(await p.evaluate(DOTS) as object) }));
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { route: '/bakim/is-emirleri/yeni', base, as: 'admin' });
    console.log(JSON.stringify({ probe: 'yeni-390', ...(await p.evaluate(YENI) as object) }));
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    const p = await ctx.newPage();
    await openRoute(p, { route: '/bakim/is-emirleri', base, as: 'admin' });
    console.log(JSON.stringify({ probe: 'isemirleri-colors', colors: await p.evaluate(COLORS) }));
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
