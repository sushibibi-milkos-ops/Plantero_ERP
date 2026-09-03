import { MoneyCell } from '@/components/money-cell';
import type { salesOrders } from '@plantero/db';

export function SalesDocSummary({ order, showChannelDeductions }: { order: typeof salesOrders.$inferSelect; showChannelDeductions: boolean }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <h2 className="mb-3 text-[13px] font-semibold">Özet</h2>
      <dl className="grid grid-cols-2 gap-y-1.5 text-[13px]">
        <dt className="text-muted-foreground">Ara toplam</dt><dd className="text-right"><MoneyCell value={order.subtotal} currency={order.currency} /></dd>
        {Number(order.discountTotal) > 0 ? (<><dt className="text-muted-foreground">İskonto</dt><dd className="text-right"><MoneyCell value={`-${order.discountTotal}`} currency={order.currency} muted /></dd></>) : null}
        <dt className="text-muted-foreground">KDV</dt><dd className="text-right"><MoneyCell value={order.vatTotal} currency={order.currency} muted /></dd>
        <dt className="font-medium">Genel toplam</dt><dd className="text-right font-medium"><MoneyCell value={order.grandTotal} currency={order.currency} /></dd>
        {showChannelDeductions ? (
          <>
            <dt className="pt-1.5 text-muted-foreground">Komisyon</dt><dd className="pt-1.5 text-right"><MoneyCell value={`-${order.commissionAmount}`} currency={order.currency} muted /></dd>
            <dt className="text-muted-foreground">Kargo kesintisi</dt><dd className="text-right"><MoneyCell value={`-${order.shippingDeduction}`} currency={order.currency} muted /></dd>
            {Number(order.otherDeduction) > 0 ? (<><dt className="text-muted-foreground">Diğer kesinti</dt><dd className="text-right"><MoneyCell value={`-${order.otherDeduction}`} currency={order.currency} muted /></dd></>) : null}
            <dt className="border-t border-border/60 pt-1.5 font-medium">Net ciro</dt><dd className="border-t border-border/60 pt-1.5 text-right font-medium text-primary"><MoneyCell value={order.netRevenue} currency={order.currency} /></dd>
          </>
        ) : null}
      </dl>
      {order.currency !== 'TRY' ? <p className="mt-3 text-xs text-muted-foreground">Kur: 1 {order.currency} = {order.exchangeRate} ₺</p> : null}
    </div>
  );
}
