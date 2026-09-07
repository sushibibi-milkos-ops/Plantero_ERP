/**
 * Tur 8 (shell) doğrulama probu: kritiğin verdiği flock bulgusu dışında, shell.json'daki tüm
 * 'open' bulguları için tek seferlik ölçüm. Yalnızca stdout'a JSON basar.
 */
import { launchBrowser, openRoute, defaultBaseUrl } from './lib/browser';

async function main() {
  const base = defaultBaseUrl();
  const browser = await launchBrowser();
  const out: Record<string, unknown> = {};

  // 1) shell-button-active-state-01: Button + kokpit RowLink active: sınıfı taşıyor mu (5 rol).
  {
    const roles = ['admin', 'depo', 'muhasebe', 'satis', 'uretim_sefi'];
    const perRole: Record<string, { total: number; withActive: number }> = {};
    for (const role of roles) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await openRoute(page, { base, route: '/kokpit', as: role });
      const res = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('a,button')).filter((el) => {
          const cs = getComputedStyle(el);
          return cs.display !== 'none' && cs.visibility !== 'hidden';
        });
        let withActive = 0;
        for (const el of els) {
          const cls = el.className.toString();
          if (/active:/.test(cls) || el.getAttribute('data-slot') === 'button') withActive++;
        }
        return { total: els.length, withActive };
      });
      perRole[role] = res;
      await page.close();
    }
    out['shell-button-active-state-01'] = perRole;
  }

  // 2) shell-qtycell-zero-tone-01: /kokpit üretim şefi 'Son iş emirleri' — sıfır ADET rengi vs dolu ADET rengi.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await openRoute(page, { base, route: '/kokpit', as: 'uretim_sefi' });
    const res = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span.num')).filter((s) => /ADET/.test(s.textContent ?? ''));
      return spans.map((s) => ({ text: (s.textContent ?? '').trim(), color: getComputedStyle(s).color }));
    });
    out['shell-qtycell-zero-tone-01'] = res;
    await page.close();
  }

  // 3) shell-combobox-option-touch-01: /ihracat/sevkiyatlar/yeni combobox açık, option yükseklikleri.
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await openRoute(page, { base, route: '/ihracat/sevkiyatlar/yeni', as: 'ihracat' });
    const trigger = page.getByRole('combobox').first();
    await trigger.click();
    await page.waitForTimeout(400);
    const heights = await page.evaluate(() => Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.getBoundingClientRect().height));
    out['shell-combobox-option-touch-01'] = heights;
    await page.close();
  }

  // 4) ayraç simetrisi (shell-mobile-card-meta-sep-space-01 / -gap-01 / mobcard-separator-gap-01):
  //    /muhasebe/banka mutabakat listesi (subtitle yok, 2+ meta) + /arge/receteler (subtitle var).
  for (const [key, route, as] of [
    ['banka', '/muhasebe/banka', 'muhasebe'],
    ['arge-receteler', '/arge/receteler', 'arge'],
  ] as const) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await openRoute(page, { base, route, as });
    const res = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.mobile-card-subtitle-row'));
      return rows.slice(0, 6).map((row) => {
        const seps = Array.from(row.querySelectorAll('span[aria-hidden]'));
        if (!seps.length) return { text: row.textContent?.trim() ?? '', noSep: true };
        return {
          text: row.textContent?.replace(/\s+/g, ' ').trim().slice(0, 40),
          separators: seps.map((sep) => {
            const cs = getComputedStyle(sep);
            return { char: sep.textContent, marginLeft: cs.marginLeft, marginRight: cs.marginRight };
          }),
        };
      });
    });
    out[`sep-${key}`] = res;
    await page.close();
  }

  // 5) shell-mobile-card-subtitle-ellipsis-01: /bakim/makineler — kırpılan alt başlıkta "…" var mı.
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await openRoute(page, { base, route: '/bakim/makineler', as: 'bakim' });
    const res = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.mobile-card-subtitle-row > span'));
      return rows
        .map((s) => {
          const el = s as HTMLElement;
          return {
            text: el.textContent?.trim().slice(0, 40),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            clipped: el.scrollWidth > el.clientWidth + 1,
            textOverflow: getComputedStyle(el).textOverflow,
            rendersEllipsis: /…/.test(el.textContent ?? ''),
          };
        })
        .filter((r) => r.clipped || r.rendersEllipsis);
    });
    out['shell-mobile-card-subtitle-ellipsis-01'] = res;
    await page.close();
  }

  // 6) shell-emptystate-compact-height-01: EmptyState compact yüksekliği + foldRows (3 rol).
  {
    const roles = ['admin', 'muhasebe', 'uretim_sefi'];
    const perRole: Record<string, unknown> = {};
    for (const role of roles) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await openRoute(page, { base, route: '/kokpit', as: role });
      const res = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('div')).filter(
          (d) => d.className.includes('py-6') && d.className.includes('px-4') && d.className.includes('gap-2'),
        );
        return els.map((e) => ({ h: Math.round(e.getBoundingClientRect().height * 10) / 10, text: e.textContent?.trim().slice(0, 40) }));
      });
      perRole[role] = res;
      await page.close();
    }
    out['shell-emptystate-compact-height-01'] = perRole;
  }

  await browser.close();
  console.log(JSON.stringify(out, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
