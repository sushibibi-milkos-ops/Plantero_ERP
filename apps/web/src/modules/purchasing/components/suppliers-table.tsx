'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { setSupplierWhitelistAction } from '../actions';
import type { SupplierCardRow } from '../queries';

export function SuppliersTable({ suppliers, canManageWhitelist }: { suppliers: SupplierCardRow[]; canManageWhitelist: boolean }) {
  if (!suppliers.length) {
    return <EmptyState icon={Building2} title="Tedarikçi yok" description="Ana veri'den tedarikçi tanımlayın." />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {suppliers.map((s) => (
        <SupplierCard key={s.id} supplier={s} canManageWhitelist={canManageWhitelist} />
      ))}
    </div>
  );
}

function SupplierCard({ supplier, canManageWhitelist }: { supplier: SupplierCardRow; canManageWhitelist: boolean }) {
  const router = useRouter();
  const [whitelisted, setWhitelisted] = useState(supplier.isPurchaseWhitelisted);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setWhitelisted(next);
    startTransition(async () => {
      const res = await setSupplierWhitelistAction({ supplierId: supplier.id, whitelisted: next });
      if (res.ok) toast.success(`${supplier.name}: beyaz liste ${next ? 'açıldı' : 'kapatıldı'}`);
      else {
        setWhitelisted(!next);
        toast.error(res.error);
      }
    });
  }

  const goToDetail = () => router.push(`/ana-veri/cariler/${supplier.id}`);

  return (
    // Tur 1 P1 tedarik-tedarikciler-04 kök neden: kart ölüydü (hover/focus/tıklama yok), tek
    // etkileşimli öğe beyaz liste switch'iydi — "Kalite skoru 50" görüp nedenini açacak bir yer
    // yoktu. DataTable'ın kendi tıklanabilir-satır kalıbıyla (rowProps, data-table.tsx) BİREBİR
    // aynı sınıflar (kriter 11 tutarlılık): hover/focus arka planı + görünür focus halkası.
    // <a> yerine div+router.push: içeride zaten etkileşimli bir kontrol (Switch) var, anchor
    // içine iç içe etkileşimli öğe koymak (geçersiz HTML) yerine DataTable'ın kullandığı yöntem.
    <div
      role="link"
      tabIndex={0}
      onClick={goToDetail}
      onKeyDown={(e) => { if (e.key === 'Enter') goToDetail(); }}
      className="flex cursor-pointer flex-col gap-3 rounded-xl border border-border/60 p-4 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{supplier.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{supplier.code}</div>
        </div>
      </div>

      {/* Tur 1 P1 tedarik-tedarikciler-03 kök neden: 4 sütunlu ortalanmış (text-center) ızgarada
       * "KALİTE SKORU" 390px'te 2 satıra sarıyor, diğer üç etiket tek satırda kalıyordu — sütunlar
       * arası taban çizgisi bozuluyor, kart altındaki sola yaslı satırlarla (açık sipariş, beyaz
       * liste) çelişen ikinci bir hizalama sistemi oluşuyordu. Sola yaslı 2x2 ızgara: her hücre iki
       * katına çıkan genişlikte, tüm etiketler tek satırda kalır; kartın geri kalanıyla aynı (sola
       * yaslı) hizalama sistemini kullanır. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/60 pt-3">
        <div>
          {/* Tur 1 P1 tedarik-tedarikciler-02 kök neden: "Lead time" İNGİLİZCE etiketi CSS
           * `uppercase` ile tr-TR yerel ayarında "LEAD TİME" olarak basılıyordu (tarayıcı 'i'yi
           * Türkçe kurala göre noktalı büyük İ'ye çeviriyor — İngilizce bir kelimede bu bozuk
           * görünüyor) ve değer birimsizdi ("10"). Alan adı reorder-rule-drawer.tsx'teki ("Tedarik
           * süresi") ile aynı Türkçe etiketle, birimiyle birlikte gösteriliyor — gerçek bir Türkçe
           * kelimede uppercase dönüşümü doğru sonuç verir. */}
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Tedarik</div>
          <div className="font-mono text-sm font-semibold tabular-nums">{supplier.leadTimeDays !== null ? `${supplier.leadTimeDays} gün` : '—'}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Kalite skoru</div>
          <div className="font-mono text-sm font-semibold tabular-nums">{supplier.qualityScore ? `${Math.round(Number(supplier.qualityScore))}/100` : '—'}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Zamanında</div>
          <div
            className={cn(
              'font-mono text-sm font-semibold tabular-nums',
              // Tur 1 P1 tedarik-tedarikciler-01 kök neden: ham Tailwind paleti (emerald/amber/
              // red-600) tema/dark-mode token zincirinin dışındaydı — modülün geri kalanı (bkz.
              // critical-stock-table.tsx RISK_CLASS) `text-success`/`text-warning`/`text-destructive`
              // token sınıflarını kullanıyor.
              supplier.onTimeDeliveryPct === null ? '' : supplier.onTimeDeliveryPct >= 90 ? 'text-success' : supplier.onTimeDeliveryPct >= 70 ? 'text-warning' : 'text-destructive',
            )}
            title={supplier.deliveryCount > 0 ? `Son ${supplier.deliveryCount} mal kabul` : 'Henüz mal kabul yok'}
          >
            {supplier.onTimeDeliveryPct === null ? '—' : `%${supplier.onTimeDeliveryPct}`}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Ürün</div>
          <div className="font-mono text-sm font-semibold tabular-nums">{supplier.productCount}</div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border/60 pt-3 text-[13px]">
        <span className="text-muted-foreground">{supplier.openPoCount} açık sipariş</span>
        <MoneyCell value={supplier.openPoValue} />
      </div>

      {canManageWhitelist ? (
        <label
          className="flex items-center justify-between gap-2 border-t border-border/60 pt-3 text-[13px]"
          // Kart artık tıklanabilir (üstte) — switch'in kendi tıklaması ve etiket metnine tıklama
          // kart navigasyonunu TETİKLEMEMELİ (stopPropagation), yoksa beyaz liste değiştirilirken
          // her seferinde cari detayına yönlenirdi.
          onClick={(e) => e.stopPropagation()}
        >
          <span>Satın alma beyaz listesi</span>
          <Switch checked={whitelisted} onCheckedChange={toggle} disabled={pending} />
        </label>
      ) : (
        <div className="border-t border-border/60 pt-3 text-[13px] text-muted-foreground">
          {whitelisted ? 'Beyaz listede' : 'Beyaz listede değil'}
        </div>
      )}
    </div>
  );
}
