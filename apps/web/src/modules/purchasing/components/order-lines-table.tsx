import { Check } from 'lucide-react';
import { MoneyCell } from '@/components/money-cell';
import { D } from '@plantero/core';
import { formatDate, formatPct, formatQty } from '@/lib/format';
import type { getPurchaseOrderDetail } from '../queries';

type Lines = NonNullable<Awaited<ReturnType<typeof getPurchaseOrderDetail>>>['lines'];

/** Sipariş satırları: miktar/alınan/faturalanan zinciri + tutar — belge zinciri okuma bağlamı (I19).
 *
 * Tur 1 P0 tedarik-po-detay-01 kök neden: bu tablo elle yazılmış (DataTable'ın mobil kart
 * karşılığı yok) — 7 sütunun 3'ü (Birim fiyat, Tutar, Beklenen tarih) 390px'te yalnızca yatay
 * kaydırmayla erişilebiliyordu, hiçbir kullanıcı bir satın alma siparişinin birim fiyatını
 * kaydırmadan görmüyordu. `md:` altında ayrı bir kart kalıbı eklendi (ürün+SKU başlık, miktar/
 * alınan meta satırı, birim fiyat + tutar sağda) — masaüstü tablo aynen korunur.
 *
 * Tur 2 P1 tedarik-po-detay-03 kök neden: 'Tutar' sütunu `line.lineTotal` (KDV DAHİL) basıyordu
 * ama yanındaki 'Birim fiyat' × 'Sipariş' KDV HARİÇ bir çarpım — kullanıcı ekrandan doğrulayamadığı
 * bir sayı görüyordu (690 × 80 = 55.200 ≠ basılan 66.240). 'Tutar' artık `line.lineSubtotal`
 * (birim fiyat × miktar ile birebir tutarlı, order-form.tsx'teki KDV hariç taban ile aynı) ve
 * araya `line.vatRate` gösteren bir 'KDV' sütunu girdi — belge sonundaki Ara toplam/KDV/Genel
 * toplam bloğu (page.tsx) satırların toplamını doğrulanabilir kılıyor. */
export function OrderLinesTable({ lines }: { lines: Lines }) {
  // Tur 4 P2 tedarik-po-detay-06 kök neden: 'Beklenen tarih' sütunu satır düzeyinde HİÇ
  // doldurulmuyor (mal kabul planlaması belge başlığındaki tek tarihe göre yapılıyor, satır
  // bazında ayrı bir teslim tarihi girilmiyor) — sütun her PO'da 0/N dolulukla ~250px boş yer
  // kaplıyordu; aynı bilgi zaten sayfa başlığında ("Beklenen: dd.MM.yyyy") var. Hiçbir satırda
  // dolu değilse sütun (başlık+hücreler) tamamen gizlenir; herhangi bir satırda doluysa (gelecekte
  // satır bazlı tarih girilirse) geri döner.
  const hasExpectedDate = lines.some((r) => r.line.expectedDate);
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border/60 md:block">
        <table className="w-full text-[13px]">
          <thead>
            {/* Tur 5 P1 tedarik-po-detay-07 kök neden: bu başlık tek başına `uppercase` (+ örtük
                letter-spacing:normal) taşıyordu — modülün diğer İKİ tablosu (`/satin-alma/siparisler`,
                `/satin-alma/tedarikciler`, ikisi de paylaşılan `DataTable`'ın th'si) `text-transform:none`,
                12px, muted. Aynı bileşen artık aynı görünür: uppercase kaldırıldı, boyut/renk paylaşılan
                th ile birebir (`text-[12px] font-medium text-muted-foreground`). */}
            <tr className="border-b border-border/60 text-left text-[12px] font-medium text-muted-foreground">
              <th className="px-3 py-2">Ürün</th>
              {/* Tur 6 P1 tedarik-po-detay-13 kök neden: sabit `px-3` (6 sayısal sütunda) + 'Tutar
                  (KDV hariç)' başlığının uzun metni bu tabloyu kabının (1152px) 4px dışına taşırıyordu
                  — modülün diğer üç tablosunda sw=cw=1152. Başlık kısaltıldı (`title` tam etiketi
                  taşır, yandaki ayrı 'KDV' sütunu zaten oranı gösteriyor) VE sayısal sütunların yatay
                  dolgusu `px-3`→`px-2` indirildi (6 sütun × 4px = 24px kazanç, taşmayı fazlasıyla giderir). */}
              <th className="px-2 py-2 text-right">Sipariş</th>
              <th className="px-2 py-2 text-right">Alınan</th>
              <th className="px-2 py-2 text-right">Faturalanan</th>
              <th className="px-2 py-2 text-right">Birim fiyat</th>
              <th className="px-2 py-2 text-right">KDV</th>
              <th className="px-2 py-2 text-right" title="Tutar (KDV hariç)">Tutar</th>
              {hasExpectedDate ? <th className="px-3 py-2">Beklenen tarih</th> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((r) => {
              const receivedFull = D(r.line.receivedQty).gte(D(r.line.qty));
              return (
                <tr key={r.line.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  {/* Tur 5 P1 tedarik-po-detay-09 kök neden: ürün adı + SKU alt alta İKİ satır
                      (`py-2.5` + iki `<div>`) taşıyordu — satır 56-57px'e çıkıyordu, hedef (kriter 3)
                      36-40px; kardeş tablolar (siparişler/tedarikçiler) zaten 36px'te. SKU artık ürün
                      adıyla AYNI satırda muted "· SKU" — bilgi kaybı yok (tam ad+SKU `title`'da), tek
                      satır + `py-2` satırı 36-40px bandına indiriyor. */}
                  <td className="px-3 py-2" title={`${r.productName} · ${r.sku}`}>
                    <span className="font-medium">{r.productName}</span>
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">· {r.sku}</span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{formatQty(r.line.qty, r.uomCode)}</td>
                  {/* Tur 5 P1 tedarik-po-detay-10 kök neden: `text-success` bu ekranda hem durum
                      rozetinin ('MAL KABUL / Tamamlandı') hem de bu MİKTARIN anlamını taşıyordu —
                      okuyucu yeşil rakamın durum mu değer mi olduğunu ayırt edemiyordu (kriter 4: yeşil
                      yalnızca BİR anlam). Renk kaldırıldı; "tam alındı" bilgisi artık nötr bir onay
                      glifiyle (rozetlerle asla karışmayan bir şekil, renk değil) veriliyor. */}
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1">
                      {formatQty(r.line.receivedQty)}
                      {receivedFull ? <Check className="size-3 shrink-0 text-muted-foreground" aria-label="Tam alındı" /> : null}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">{formatQty(r.line.invoicedQty)}</td>
                  <td className="px-2 py-2 text-right"><MoneyCell value={r.line.unitPrice} /></td>
                  {/* Tur 3 P1 tedarik-po-detay-04 kök nedeni: oran ham numeric(18,4) ("20.0000") ile
                      basılıyordu — bir para tutarı değil, 4 ondalık bilgi taşımıyor. `formatPct`
                      (`/satin-alma/siparisler/yeni` özet bloğuyla aynı yardımcı) gereksiz sıfırları
                      kırpar: "%20", "%8,5". */}
                  <td className="px-2 py-2 text-right font-mono text-[13px] tabular-nums text-muted-foreground">{formatPct(r.line.vatRate, 2)}</td>
                  <td className="px-2 py-2 text-right"><MoneyCell value={r.line.lineSubtotal} /></td>
                  {hasExpectedDate ? <td className="px-3 py-2 text-muted-foreground">{r.line.expectedDate ? formatDate(r.line.expectedDate) : '—'}</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {lines.map((r) => {
          const receivedFull = D(r.line.receivedQty).gte(D(r.line.qty));
          return (
            // Tur 6 P1 tedarik-po-detay-12 kök neden: kart üç ayrı satıra yığılıyordu (ürün+SKU alt
            // alta, tutar+'KDV hariç · %oran' alt alta, miktar satırı) — 81px, hedef (kriter 3) 56-72px.
            // Masaüstü tabloda po-detay-09'da SKU ürün adıyla AYNI satıra alınmıştı; aynı kalıp burada
            // da: SKU tek satırda ada eklendi, 'KDV hariç · %oran' ayrı satırdan kaldırılıp birim
            // fiyatla birlikte İKİNCİ (miktar) satırın akışına katıldı — kart artık 2 satır.
            <li key={r.line.id} className="rounded-lg border border-border/70 bg-card p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 truncate text-[14px] leading-5 font-medium" title={`${r.productName} · ${r.sku}`}>
                  {r.productName}
                  <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">· {r.sku}</span>
                </div>
                <MoneyCell value={r.line.lineSubtotal} className="shrink-0 text-[13px] font-semibold tabular-nums" />
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                {/* tedarik-po-detay-10 ile aynı düzeltme: renk yerine nötr onay glifi. */}
                <span className="min-w-0 truncate">
                  {formatQty(r.line.qty, r.uomCode)} sipariş · {formatQty(r.line.receivedQty)} alınan
                  {receivedFull ? <Check className="ml-0.5 inline size-3 align-[-1px]" aria-label="Tam alındı" /> : null}
                </span>
                <span className="shrink-0 tabular-nums">
                  <MoneyCell value={r.line.unitPrice} className="inline tabular-nums" digits={2} /> · {formatPct(r.line.vatRate, 2)}
                </span>
              </div>
              {r.line.expectedDate ? <div className="mt-0.5 text-[11px] text-muted-foreground">Beklenen: {formatDate(r.line.expectedDate)}</div> : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
