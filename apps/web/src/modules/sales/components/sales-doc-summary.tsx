import { MoneyCell } from '@/components/money-cell';
import type { salesOrders } from '@plantero/db';

export function SalesDocSummary({ order, showChannelDeductions }: { order: typeof salesOrders.$inferSelect; showChannelDeductions: boolean }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <h2 className="mb-3 text-[13px] font-semibold">Özet</h2>
      <dl className="grid grid-cols-2 gap-y-1.5 text-[13px]">
        <dt className="text-muted-foreground">Ara toplam</dt><dd className="text-right"><MoneyCell value={order.subtotal} currency={order.currency} /></dd>
        {Number(order.discountTotal) > 0 ? (<><dt className="text-muted-foreground">İskonto</dt><dd className="text-right"><MoneyCell value={`-${order.discountTotal}`} currency={order.currency} muted /></dd></>) : null}
        {/* `muted` yalnızca değer sıfırsa — sabit soluk ton, ₺40,40 gibi sıfır olmayan KDV'yi de
            "önemsiz" gibi gösteriyordu (MoneyCell zaten sıfır değeri kendi başına soluklaştırır). */}
        <dt className="text-muted-foreground">KDV</dt><dd className="text-right"><MoneyCell value={order.vatTotal} currency={order.currency} /></dd>
        <dt className="font-medium">Genel toplam</dt><dd className="text-right font-medium"><MoneyCell value={order.grandTotal} currency={order.currency} /></dd>
        {showChannelDeductions ? (
          <>
            {/* "Genel toplam" KDV DAHİL — hemen altında görsel olarak çıkarma bekleten Komisyon/Kargo
                satırları başlıyordu ama aradaki ₺KDV farkı hiç yazılmıyordu, toplam gözle tutmuyordu
                (Tur 5 P1 bulgusu: 4.080,00 − 0 − 0 ≠ 4.039,60, fark tam olarak KDV idi). KDV burada
                muted ikinci kez tekrarlanır (matematiksel köprü), yalnızca sıfır değilse. */}
            {Number(order.vatTotal) > 0 ? (<><dt className="pt-1.5 text-muted-foreground">KDV (−)</dt><dd className="pt-1.5 text-right"><MoneyCell value={`-${order.vatTotal}`} currency={order.currency} muted /></dd></>) : null}
            {/* Sıfır tutarda eksi işareti basılmaz — "-₺0,00" tutarsız okunuyordu (Tur 5 P1 bulgusu).
                pt-1.5 artık KDV satırı render olsa da olmasa da "Genel toplam"dan sonraki İLK kesinti
                satırına gider — grupla üstteki toplam arasında hep aynı boşluk kalır. */}
            <dt className={Number(order.vatTotal) === 0 ? 'pt-1.5 text-muted-foreground' : 'text-muted-foreground'}>Komisyon</dt>
            <dd className={Number(order.vatTotal) === 0 ? 'pt-1.5 text-right' : 'text-right'}><MoneyCell value={Number(order.commissionAmount) > 0 ? `-${order.commissionAmount}` : order.commissionAmount} currency={order.currency} muted /></dd>
            <dt className="text-muted-foreground">Kargo kesintisi</dt><dd className="text-right"><MoneyCell value={Number(order.shippingDeduction) > 0 ? `-${order.shippingDeduction}` : order.shippingDeduction} currency={order.currency} muted /></dd>
            {Number(order.otherDeduction) > 0 ? (<><dt className="text-muted-foreground">Diğer kesinti</dt><dd className="text-right"><MoneyCell value={`-${order.otherDeduction}`} currency={order.currency} muted /></dd></>) : null}
            {/* Marka yeşili (text-primary) hem birincil eylem hem "iyi haber" (pozitif delta) anlamı
                taşıyor — nötr bir toplam rakamına uygulanınca yanlış sinyal veriyordu. Ayrım
                border-t + font-semibold ile kurulur, renk foreground'da kalır. */}
            <dt className="border-t border-border/60 pt-1.5 font-medium">Net ciro</dt><dd className="border-t border-border/60 pt-1.5 text-right font-semibold text-foreground"><MoneyCell value={order.netRevenue} currency={order.currency} /></dd>
          </>
        ) : null}
      </dl>
      {order.currency !== 'TRY' ? <p className="mt-3 text-xs text-muted-foreground">Kur: 1 {order.currency} = {order.exchangeRate} ₺</p> : null}
    </div>
  );
}
