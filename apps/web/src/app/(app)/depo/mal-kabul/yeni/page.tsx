import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth';
import { listWarehouses, listLocations, listSuppliers, listProductsForPicker, getPurchaseOrderWithLines, listOpenPurchaseOrders } from '@/modules/stock/queries';
import { ReceiptForm } from '@/modules/stock/components/receipt-form';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Yeni Mal Kabul' };
export const dynamic = 'force-dynamic';

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<{ po?: string }> }) {
  await requirePermission('stock.receive');
  const { po } = await searchParams;
  const [warehouses, locations, suppliers, products, poData, openPurchaseOrders] = await Promise.all([
    listWarehouses(),
    listLocations(),
    listSuppliers(),
    listProductsForPicker(),
    po ? getPurchaseOrderWithLines(po) : Promise.resolve(null),
    // P0 düzeltme (docs/INVARIANTS.md I24): sayfa ?po= olmadan açılırsa bile kullanıcı bir siparişe
    // bağlanabilsin diye açık siparişler önceden yüklenir (bkz. receipt-form.tsx "Sipariş seç").
    po ? Promise.resolve([]) : listOpenPurchaseOrders(),
  ]);

  const initialLines = poData?.lines
    .filter((l) => Number(l.line.qty) - Number(l.line.receivedQty) > 0)
    .map((l) => {
      const product = products.find((p) => p.id === l.line.productId);
      return {
        purchaseOrderLineId: l.line.id,
        productId: l.line.productId,
        qty: (Number(l.line.qty) - Number(l.line.receivedQty)).toString(),
        uomId: l.line.uomId,
        unitCost: l.line.unitPrice,
        supplierLotNo: '',
        expiryDate: '',
        productionDate: '',
        disposition: (product?.requiresIncomingQc ? 'quarantine' : 'released') as 'quarantine' | 'released',
        toLocationId: '',
        rejectedQty: '0',
        rejectReason: '',
      };
    });

  return (
    <>
      <PageHeader
        title="Yeni Mal Kabul"
        description={poData ? `${poData.po.docNo} siparişinden — kalan satırlar önceden dolduruldu` : 'Tedarikçiden gelen malzemeyi kabul edin'}
      />
      <ReceiptForm
        // P0 düzeltme: "Sipariş seç" combobox'ı `/depo/mal-kabul/yeni` → `?po=<id>` geçişini
        // `router.push` ile yapıyor — aynı sayfa (yalnızca arama parametresi değişiyor), Next.js App
        // Router bu durumda bileşeni YENİDEN MOUNT ETMEZ; `useForm`'un `defaultValues`'ı ilk mount'ta
        // donmuş kaldığından yeni `initialLines`/`initialPartnerId` hiç uygulanmıyordu (tur 6, canlı
        // Playwright denemesinde yakalandı: seçim sonrası form boş kalıyordu). `key={po}` PO değişince
        // React'i bileşeni tazeden kurmaya zorlar — normal `<Link>` ile route değişiminde (ör. sipariş
        // detayından "Mal kabul oluştur") zaten farklı pathname olduğundan soruna gerek yoktu.
        key={po ?? 'blank'}
        warehouses={warehouses}
        suppliers={suppliers}
        products={products}
        locations={locations.map((l) => ({ id: l.id, code: l.code, usage: l.usage, warehouseId: l.warehouseId, isPickable: l.isPickable }))}
        purchaseOrderId={po}
        openPurchaseOrders={openPurchaseOrders}
        initialLines={initialLines}
        initialWarehouseId={poData?.po.warehouseId}
        initialPartnerId={poData?.po.partnerId}
      />
    </>
  );
}
