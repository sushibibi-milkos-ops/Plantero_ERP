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
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground uppercase">
              <th className="px-3 py-2 font-medium">Ürün</th>
              <th className="px-3 py-2 text-right font-medium">Sipariş</th>
              <th className="px-3 py-2 text-right font-medium">Alınan</th>
              <th className="px-3 py-2 text-right font-medium">Faturalanan</th>
              <th className="px-3 py-2 text-right font-medium">Birim fiyat</th>
              <th className="px-3 py-2 text-right font-medium">KDV</th>
              <th className="px-3 py-2 text-right font-medium">Tutar (KDV hariç)</th>
              {hasExpectedDate ? <th className="px-3 py-2 font-medium">Beklenen tarih</th> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((r) => {
              const receivedFull = D(r.line.receivedQty).gte(D(r.line.qty));
              return (
                <tr key={r.line.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{r.productName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatQty(r.line.qty, r.uomCode)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${receivedFull ? 'text-success' : ''}`}>{formatQty(r.line.receivedQty)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{formatQty(r.line.invoicedQty)}</td>
                  <td className="px-3 py-2.5 text-right"><MoneyCell value={r.line.unitPrice} /></td>
                  {/* Tur 3 P1 tedarik-po-detay-04 kök nedeni: oran ham numeric(18,4) ("20.0000") ile
                      basılıyordu — bir para tutarı değil, 4 ondalık bilgi taşımıyor. `formatPct`
                      (`/satin-alma/siparisler/yeni` özet bloğuyla aynı yardımcı) gereksiz sıfırları
                      kırpar: "%20", "%8,5". */}
                  <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-muted-foreground">{formatPct(r.line.vatRate, 2)}</td>
                  <td className="px-3 py-2.5 text-right"><MoneyCell value={r.line.lineSubtotal} /></td>
                  {hasExpectedDate ? <td className="px-3 py-2.5 text-muted-foreground">{r.line.expectedDate ? formatDate(r.line.expectedDate) : '—'}</td> : null}
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
            <li key={r.line.id} className="rounded-lg border border-border/70 bg-card p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[14px] leading-5 font-medium">{r.productName}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>
                </div>
                <div className="shrink-0 text-right">
                  <MoneyCell value={r.line.lineSubtotal} className="text-[13px] font-semibold tabular-nums" />
                  <div className="text-[10px] text-muted-foreground">KDV hariç · {formatPct(r.line.vatRate, 2)}</div>
                </div>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span className="min-w-0 truncate">
                  {formatQty(r.line.qty, r.uomCode)} sipariş · <span className={receivedFull ? 'text-success' : ''}>{formatQty(r.line.receivedQty)} alınan</span>
                </span>
                <MoneyCell value={r.line.unitPrice} className="shrink-0 tabular-nums" digits={2} />
              </div>
              {r.line.expectedDate ? <div className="mt-0.5 text-[11px] text-muted-foreground">Beklenen: {formatDate(r.line.expectedDate)}</div> : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
