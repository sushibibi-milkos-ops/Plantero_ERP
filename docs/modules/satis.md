# Modül: Satış & CRM (sales)

Route kökü `/satis`, izinler `sales.*`, core `packages/core/src/sales/**`, web `apps/web/src/modules/sales/**`, seed `seed/sales.ts`.

## Ekranlar
1. `/satis/firsatlar` — kanban (dnd-kit, sütunlar: opportunity_stages), kart: başlık, cari/kişi, tutar, olasılık, sonraki aktivite tarihi (gecikmiş kırmızı), sahibi avatar. Sürükle → `moveOpportunity`. Sağ drawer detay: alanlar, aktivite akışı (arama/e-posta/toplantı/not ekle), "Teklife dönüştür" → quotation (docType quotation) + `opportunities.quotationId`. Üstte huni özeti (aşama başına adet/tutar) ve kazanma oranı. Liste görünümü toggle.
2. `/satis/teklifler` — liste + form (`docType: quotation`, QT-…); "Gönder" (status sent, PDF), "Kabul edildi" → "Siparişe dönüştür" (`convertQuotationToOrder`: yeni SO, satırlar kopya, document_links(quotation→sales_order), teklif status accepted).
3. `/satis/siparisler` — tablo: no, tarih, müşteri, kanal rozeti (renkli), durum, toplam, net ciro, teslim/fatura ilerleme (küçük çubuk). Filtre kanal/durum/tarih; arama (no, müşteri, dış sipariş no). Form: müşteri (combobox; seçince kanal, fiyat listesi, vade, adresler dolar), satırlar: ürün (barkod/ad arama) → **fiyat çözümleme** (`resolvePrice`: müşteri özel fiyat > kanal fiyat listesi > ürün liste fiyatı; kaynak rozeti), miktar, iskonto, KDV (üründen), satır toplam; alt özet: ara toplam, KDV, genel toplam, **kanal kesintileri** (komisyon %, kargo, diğer → net ciro). "Onayla" (`confirmOrder`: status confirmed, stok kullanılabilirlik uyarısı (eksik satırlar), otomatik irsaliye taslağı `createDeliveryFromOrder`, document_links). Detay: satırlar (sipariş/teslim/fatura miktarları), irsaliyeler, faturalar, tahsilatlar, **belge zinciri** bileşeni, net ciro kutusu, iş emri oluştur, "Fatura oluştur" (teslim edilen miktar için `createInvoiceFromDelivery` — core/sales/invoicing.ts: invoice + invoice_lines (lot, COGS bilgi), `postJournalEntry` 120 / 600 + 391, dövizli ise TCMB kuru ile TL karşılığı, partner balance güncelle, document_links(delivery→invoice), salesOrderLines.invoicedQty; e-Fatura gönderimi muhasebe modülünde).
4. `/satis/kanallar` — kanal kartları (Trendyol/Hepsiburada/Site/Toptan/Migros/İhracat/Hammadde): bugün/ay ciro, sipariş adedi, komisyon oranı, senkron durumu (son senkron, hata), "Şimdi senkronize et" (`syncChannelOrders`: integrations marketplace `fetchOrders` → `channel_orders` upsert → `convertChannelOrder`: cari = kanal pazaryeri carisi, satırlar barkod eşleştirme (eşleşmeyen → sync_status error), SO origin `sync`, otomatik onay + irsaliye taslağı). Ayarlar drawer: komisyon %, kargo kesintisi, settlement gün, sync açık/kapalı.
5. `/satis/fiyat-listeleri` — listeler + satırlar (ürün, min miktar, fiyat, geçerlilik), müşteri özel fiyatlar sekmesi (cari, ürün, fiyat, onaylayan). Toplu güncelleme (% artış) `sales.price` izni.
6. `/satis/net-ciro` — **Stripe tarzı**: dönem seçici (bugün/7g/30g/ay/özel), KPI: brüt ciro, komisyon, kargo, iadeler, **net ciro**, sipariş, ortalama sepet; kanal bazlı çizgi/alan grafik (recharts, günlük net ciro), tablo: kanal → brüt / komisyon / kargo / diğer / net / net marj %; karşılaştırma deltası (önceki dönem). Veri kaynağı: sales_orders (confirmed+) + channel_settlements.
7. `/satis/musteriler` yok — cariler ana veride; SO ekranından cari detayına bağlantı.

## Core servisleri
`sales/pricing.ts` (`resolvePrice`, `computeLineTotals`, `computeChannelDeductions`), `sales/orders.ts` (`createSalesDoc`, `updateLines`, `sendQuotation`, `convertQuotationToOrder`, `confirmOrder`, `cancelOrder`, `recomputeOrderStatus` (teslim/fatura durumuna göre)), `sales/invoicing.ts` (`createInvoiceFromDelivery`, `createInvoiceFromOrder` (teslimatsız hizmet/hammadde satışı için), `postInvoice`), `sales/channels.ts` (`syncChannelOrders`, `convertChannelOrder`, `getChannelRevenue(period)`), `sales/crm.ts` (`createOpportunity`, `moveOpportunity`, `addActivity`, `convertToQuotation`, `getFunnel`).

## Seed (`seed/sales.ts`) — core servisleriyle
- 12 fırsat (aşamalara dağılmış, 3 kazanılmış → teklif → sipariş), 4 teklif.
- 30 sipariş son 60 güne yayılmış: Trendyol 10, Hepsiburada 8, Site 3, Toptan 5, Migros 2, İhracat 1 (EUR), Hammadde 1. Durumlar: 18 sevk edilmiş + faturalanmış (depo seed'indeki açılış mamul lotlarından FEFO), 5 sevk edilmiş faturasız, 4 onaylı sevk bekliyor, 3 taslak. Pazaryeri siparişlerinin 6'sı `channel_orders`'tan dönüşmüş (sandbox). 2 channel_settlements kaydı (biri ödenmiş).
- Fatura tarihleri: 6 fatura vadesi geçmiş (tahsilat takibi için), Migros faturası 60 gün vadeli.

## Kabul kriterleri
- Fiyat çözümleme kaynağı ekranda görünür ve doğru öncelik.
- Sipariş onayı → irsaliye taslağı → sevk → fatura zinciri `document_links`te tam; I7/I8/I9/I10 yeşil.
- Net ciro ekranındaki toplamlar SQL ile birebir doğrulanabilir.
