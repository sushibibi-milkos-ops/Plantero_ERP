# Modül: Kokpit (cockpit)

Route `/kokpit`, izin `cockpit.view` (rol bazlı içerik), web `apps/web/src/modules/cockpit/**`, core `packages/core/src/cockpit/kpis.ts`.

**Rol bazlı canlı KPI ana ekranı** (Stripe Dashboard çıtası; 60 sn yenileme, server components + `revalidate`):
- Genel Müdür/Admin: günlük kanal satışları (bugün brüt/net, kanal çubukları, 7 gün trend sparkline), banka toplamı (hesap kartları + toplam, ekstre bakiyesi), açık iş emirleri (hat başına), kritik stok (kapsama < lead time kalem sayısı + liste), SKT riski (30/60/90 kova değerleri), geciken alacak (yaşlandırma + en büyük 5), **break-even'a uzaklık** (bu ay gereken min ciro vs gerçekleşen; ilerleme; günlük gereken tempo), onay bekleyenler (mutabakat/satın alma/hatırlatma sayaçları, hızlı link), son aktiviteler (audit).
- Depo: mal kabul bekleyen, sevk bekleyen, sayım, SKT, karantina.
- Üretim şefi: hat durumu, bugünkü OEE, açık/geciken iş emirleri, fire oranı.
- Muhasebe/Finans: banka, mutabakat kuyruğu, vadesi geçen, KDV pozisyonu, nakit projeksiyonu 3 ay, break-even.
- Satış: huni, bugün siparişler, kanal ciro, net ciro, en çok satan 5.
- Kalite: bekleyen QC, red oranı, tedarikçi skoru düşenler, geri çağırma.
- Bakım: down makineler, bugünkü bakım, OEE.
Tüm rakamlar `packages/core/src/cockpit/kpis.ts` fonksiyonlarından; her KPI SQL ile doğrulanabilir (veri-critic). Mobil: kartlar tek kolon, en kritik 4 kart üstte. Kartlar: büyük tabular rakam (NumberFlow), küçük etiket, delta (önceki dönem), mini grafik (recharts, gölgesiz).
