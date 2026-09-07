'use client';

import { useMemo } from 'react';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { formatDate, formatRate } from '@/lib/format';
// `@plantero/core` barrel `node:crypto` içe aktarır — client bundle'a sızmasın diye doğrudan
// `decimal.js` (order-lines-table.tsx / packing-list-table.tsx'teki aynı gerekçe).
import Decimal from 'decimal.js';
import type { RateRow } from '../queries';

const CURRENCY_LABEL: Record<string, string> = { USD: 'USD', EUR: 'EUR', GBP: 'GBP' };

// Tur 4 P2 ihracat-kurlar-08 kök neden düzeltmesi: `exchange_rates.source` alanı seed verisinde
// tohumlama kökenini işaretlemek için '-SEED' son ekiyle yazılıyor (packages/db/src/seed/export.ts) —
// bu, VERİ KATMANI için doğru bir ayrım ama EKRANDA gösterilince "bu bir demo/test verisi" izlenimi
// veriyor ve ekranın gerçek bir finans panosu olduğu algısını bozuyor. Kaynağın gerçek kimliği
// (TCMB) korunur, yalnızca tohumlama son eki EKRAN etiketinden temizlenir; alttaki veri değişmez.
function sourceLabel(source: string): string {
  return source.replace(/-SEED$/i, '');
}

// Tur 8 P2 ihracat-kurlar-11 kök neden düzeltmesi: paylaşılan `formatPct` (lib/format.ts)
// `minimumFractionDigits: 0` kullanıyor — tam yüzdelere yakın satırlarda (ör. %0,50) sondaki sıfır
// kırpılıp "%0,5" basılıyor, sağa hizalı tabular-nums sütunda ondalık virgülü satırdan satıra kayıyor.
// Paylaşılan `format.ts` DEĞİŞTİRİLMEDEN (diğer modüllerdeki `formatPct` çağrıları etkilenmesin diye)
// bu sütuna ÖZEL, sabit 2 ondalıklı yerel bir biçimlendirici tanımlanır.
const DAILY_CHANGE_FMT = new Intl.NumberFormat('tr-TR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function formatDailyChangePct(v: number): string {
  return DAILY_CHANGE_FMT.format(v / 100);
}

/**
 * TCMB kur geçmişi — paylaşılan `DataTable` üzerinden (Tur 1 P1 kök neden düzeltmesi):
 * - ihracat-kurlar-01: elle yazılmış tablo 390px'te 'Kaynak' sütununu iki satıra sarıp
 *   kırpıyordu — `DataTable`'ın otomatik mobil kart dönüşümü kırpmayı kökten kaldırır.
 * - ihracat-kurlar-02: UPPERCASE başlık + arama/filtre/sıralama/sütun görünürlüğü yoktu —
 *   modülün diğer üç listesiyle (sevkiyatlar/belgeler/gtip) artık aynı anatomi.
 * - ihracat-kurlar-03: 60+ satır tek seferde dökülüyordu, sayfalama yoktu — `pageSize=25`.
 * - ihracat-kurlar-04: satırlar tıklanamazken hover arka planı vaat ediyordu — bu tabloda
 *   `rowHref`/`onRowClick` YOK, `DataTable` yalnızca tıklanabilir satırlarda hover ekler.
 */
export function RatesTable({ rows }: { rows: RateRow[] }) {
  // Tur 7 P2 ihracat-kurlar-10 kök neden düzeltmesi: 5 dar sütun (tarih/para birimi/2 kur/kaynak)
  // 1152px'lik kapsayıcıyı doldurmaya yetmiyordu — DataTable'ın auto table-layout'u eksik genişliği
  // TÜM sütunlara oransal olarak yayıyordu (ör. 120px'lik 'Alış' 227px'e şişiyordu). Sütun genişliği
  // ayarıyla tek başına çözülemez (5 sütunun toplam gerçek içerik genişliği zaten dar); kök neden
  // gerçek bilgi eksikliği — kartın kendisi Stripe'ın "delta" kalıbını (KpiCard'daki büyük rakam +
  // küçük etiket + değişim) taşımıyordu. Aynı para biriminin BİR ÖNCEKİ güne göre değişimini
  // (`selling` bazında) gösteren "Günlük değişim" sütunu boşluğu bilgiyle dolduruyor.
  //
  // Tur 8 P2 ihracat-kurlar-12 kök neden düzeltmesi: tarayıcının auto table-layout algoritması
  // `meta.width` değerlerini BASİT, tek bir ortak çarpanla orantılı ölçeklemiyor (bkz.
  // documents-table.tsx'teki aynı tespitin ayrıntılı notu) — bir sütunun kendi hücre içeriğinin
  // doğal genişliğinin ALTINDA kalan `width` değerleri sonucu neredeyse hiç etkilemiyor, yalnızca
  // BAŞKA sütunların "kullanılmayan" payı o sütuna akıyor. İlk 'Günlük değişim' eklemesinde
  // (width:200) diğer 5 sütun küçük tutulduğundan (100/100/110/110/100) kullanılmayan pay neredeyse
  // tamamen bu TEK sütuna akıyordu (render genişliği 320, slack 203). Aşağıdaki 6 taban değer
  // matematiksel bir formülden değil, gerçek tarayıcıda ÖLÇÜLEREK (scripts/probe-ihracat-r8c-fix.ts,
  // 1440x900) bulunmuş, hiçbir sütunun tek başına payın çoğunu almadığı bir dengedir — sonuç: 6
  // sütun da ≤120px slack'te (114/112/112/112/115/115). Bu dosyadaki herhangi bir `width`
  // değiştirilirse probe YENİDEN çalıştırılıp tüm sütunların slack'i kontrol edilmeli.
  const changeByKey = useMemo(() => {
    const byCurrency = new Map<string, RateRow[]>();
    for (const r of rows) {
      const arr = byCurrency.get(r.currency);
      if (arr) arr.push(r);
      else byCurrency.set(r.currency, [r]);
    }
    const map = new Map<string, Decimal | null>();
    for (const arr of byCurrency.values()) {
      const sorted = [...arr].sort((a, b) => (a.rateDate < b.rateDate ? -1 : a.rateDate > b.rateDate ? 1 : 0));
      for (let i = 0; i < sorted.length; i++) {
        const cur = sorted[i]!;
        const prev = i > 0 ? sorted[i - 1] : undefined;
        const key = `${cur.currency}-${cur.rateDate}`;
        map.set(key, !prev || new Decimal(prev.selling).isZero() ? null : new Decimal(cur.selling).minus(prev.selling).div(prev.selling).times(100));
      }
    }
    return map;
  }, [rows]);

  const columns = useMemo<ColumnDef<RateRow, unknown>[]>(
    () => [
      { id: 'rateDate', accessorFn: (r) => r.rateDate, header: 'Tarih', meta: { width: 180, mobile: 'subtitle' }, cell: ({ getValue }) => formatDate(getValue<string>()) },
      { id: 'currency', accessorFn: (r) => r.currency, header: 'Para birimi', meta: { width: 195, mobile: 'title' }, cell: ({ getValue }) => <span className="font-medium">{CURRENCY_LABEL[getValue<string>()] ?? getValue<string>()}</span> },
      { id: 'buying', accessorFn: (r) => r.buying, header: 'Alış', meta: { align: 'right', width: 170, mobile: 'hidden' }, cell: ({ getValue }) => <span className="font-mono tabular-nums">{formatRate(getValue<string>())}</span> },
      {
        id: 'selling',
        accessorFn: (r) => r.selling,
        header: 'Satış',
        meta: { align: 'right', width: 170 },
        // Tur 5 P2 ihracat-kurlar-09 kök neden düzeltmesi: masaüstünde "Alış" ayrı bir sütunda
        // mobile:'hidden' olduğundan mobil kartın metrik yuvasında yalnızca bu (satış) kuru kalıyor
        // ama etiketsiz — iki kur birbirine %0,5 yakın olduğundan kullanıcı hangisine baktığını
        // ayırt edemiyordu. Etiket YALNIZCA mobil kartta görünür (`md:hidden`): masaüstü <table> ve
        // mobil <ul> aynı hücre render fonksiyonunu paylaşıyor (data-table.tsx `hidden md:block` /
        // `md:hidden` ile aynı DOM'u iki katmanda tutuyor) — masaüstünde zaten "Satış" başlığı var,
        // etiket orada `md:hidden` ile hiç görünmez; kartta ise görünür.
        cell: ({ getValue }) => (
          <span className="font-mono tabular-nums">
            <span className="mr-1 text-[11px] font-sans text-muted-foreground md:hidden">Satış</span>
            {formatRate(getValue<string>())}
          </span>
        ),
      },
      {
        // accessorFn ZORUNLU (Tur 7 sırasında bulundu): accessor'sız sütunlarda `getValue()` her
        // zaman `undefined` döner — mobile-cards.tsx'in `isEmptyValue` filtresi bunu HER SATIRDA
        // "boş" sayıp sütunü mobil meta zincirinden koşulsuz düşürüyordu (hücre gerçek bir yüzde
        // bassa bile). accessorFn gerçek Decimal|null değerini döndürünce filtre doğru çalışır.
        id: 'dailyChange', accessorFn: (r) => changeByKey.get(`${r.currency}-${r.rateDate}`) ?? null, header: 'Günlük değişim', meta: { align: 'right', width: 225, mobile: 'meta' },
        cell: ({ row }) => {
          const d = changeByKey.get(`${row.original.currency}-${row.original.rateDate}`);
          if (!d) return <span className="text-muted-foreground">—</span>;
          const isZero = d.isZero();
          const isUp = d.gt(0);
          const cls = isZero ? 'text-muted-foreground' : isUp ? 'text-success' : 'text-destructive';
          return <span className={`font-mono tabular-nums ${cls}`}>{isUp && !isZero ? '+' : ''}{formatDailyChangePct(d.toNumber())}</span>;
        },
      },
      { id: 'source', accessorFn: (r) => r.source, header: 'Kaynak', meta: { width: 180, mobile: 'meta' }, cell: ({ getValue }) => <span className="text-muted-foreground">{sourceLabel(getValue<string>())}</span> },
    ],
    [changeByKey],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'currency', title: 'Para birimi', options: Object.entries(CURRENCY_LABEL).map(([value, label]) => ({ value, label })) },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => `${r.currency}-${r.rateDate}`}
      searchPlaceholder="Para birimi, kaynak ara…"
      filters={filters}
      pageSize={25}
      initialSorting={[{ id: 'rateDate', desc: true }]}
      emptyTitle="Kur verisi yok"
    />
  );
}
