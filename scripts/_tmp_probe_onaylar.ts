import { defaultBaseUrl, launchBrowser, openRoute } from './lib/browser';

function collect() {
  const isVisible = (el: Element): boolean => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const main = document.querySelector('main');
  const fontSizes: Record<string, number> = {};
  if (main) {
    const all = Array.from(main.querySelectorAll('*'));
    for (const el of all) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
      let hasText = false;
      for (const n of Array.from(el.childNodes)) {
        if (n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim()) { hasText = true; break; }
      }
      if (!hasText || !isVisible(el)) continue;
      const size = String(Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10);
      fontSizes[size] = (fontSizes[size] ?? 0) + 1;
    }
  }

  const bodyText = main?.innerText ?? '';
  const rawMoneyMatches = Array.from(bodyText.matchAll(/₺\d[\d.,]*\.\d{2}(?!\d)/g)).map((m) => m[0]);
  const rawCodeMatches = Array.from(bodyText.matchAll(/[a-zA-Z]+[A-Z][a-zA-Z]*=(?:true|false)/g)).map((m) => m[0]);

  const rows = Array.from(document.querySelectorAll('div[role="option"]'));
  let emptyAmountRows = 0;
  const totalRows = rows.length;
  const amountVisible: boolean[] = [];
  const confidenceVisible: boolean[] = [];
  for (const row of rows) {
    const rowInner = row.querySelector(':scope > div');
    const spans = rowInner ? Array.from(rowInner.querySelectorAll(':scope > span')) : [];
    const amountSpan = spans.find((s) => s.className.includes('text-right') && s.className.includes('tabular-nums') && s.className.includes('w-28'));
    const hasAmount = !!amountSpan && isVisible(amountSpan) && (amountSpan.textContent ?? '').trim().length > 0;
    if (!hasAmount) emptyAmountRows++;
    amountVisible.push(hasAmount);
    const confSpan = spans.find((s) => s.className.includes('rounded-full') && s.className.includes('tabular-nums'));
    confidenceVisible.push(!!confSpan && isVisible(confSpan));
  }

  return { fontSizes, rawMoneyMatches, rawCodeMatches, emptyAmountRows, totalRows, amountVisible, confidenceVisible };
}

async function main() {
  const arg = process.argv[2] ?? '1440x900';
  const [w, h] = arg.split('x').map(Number);
  const isMobile = w! < 768;
  const browser = await launchBrowser();
  try {
    const ctx = await browser.newContext({
      viewport: { width: w!, height: h! },
      deviceScaleFactor: 2,
      isMobile,
      hasTouch: isMobile,
      locale: 'tr-TR',
      timezoneId: 'Europe/Istanbul',
    });
    const page = await ctx.newPage();
    await openRoute(page, { route: '/onaylar', as: 'admin', base: defaultBaseUrl(), viewport: { width: w!, height: h! }, dark: false });
    const data = await page.evaluate(`(() => { const __name = (f) => f; return (${collect.toString()})(); })()`);
    console.log(JSON.stringify(data, null, 2));
    await ctx.close();
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
