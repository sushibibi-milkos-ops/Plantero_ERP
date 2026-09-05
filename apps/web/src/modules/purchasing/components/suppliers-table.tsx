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
      // Tur 2 P1 tedarik-tedarikciler-05 kök neden: kart 6 kayıt için 265px yüksekliğe (alan
      // başına ~33px) çıkıyordu — ad/kod başlığı, 2x2 metrik ızgarası (kendi hairline'ı) ve switch
      // satırı (kendi hairline'ı) üç ayrı hizalama bölgesi oluşturuyordu ("kutu içinde kutu").
      // Beyaz liste anahtarı artık başlıkla AYNI satırda (kendi hairline/padding bloğu yok);
      // 4 metrik tek bir küçük-metin satırına indi (etiket+değer aynı satırda, "gün" TAM kelime
      // korunur — tedarik-tedarikciler-02 rejeksiyonu). Sonuç: 4 hizalama bölgesi yerine 3 kompakt
      // satır (~132px, hedef ≤160px).
      className="flex cursor-pointer flex-col gap-2 rounded-xl border border-border/60 p-4 hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{supplier.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{supplier.code}</div>
        </div>
        {canManageWhitelist ? (
          <label
            className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground"
            title="Satın alma beyaz listesi"
            // Kart tıklanabilir (üstte) — switch'in kendi tıklaması kart navigasyonunu
            // TETİKLEMEMELİ (stopPropagation), yoksa beyaz liste değiştirilirken her seferinde
            // cari detayına yönlenirdi.
            onClick={(e) => e.stopPropagation()}
          >
            <span className="hidden sm:inline">Beyaz liste</span>
            <Switch checked={whitelisted} onCheckedChange={toggle} disabled={pending} />
          </label>
        ) : (
          <span className={cn('shrink-0 text-[11px]', whitelisted ? 'text-success' : 'text-muted-foreground')}>
            {whitelisted ? 'Beyaz listede' : 'Beyaz listede değil'}
          </span>
        )}
      </div>

      {/* Tek satır metrik özeti: etiket+değer aynı satırda, "gün" tam kelime (tedarik-tedarikciler-02
       * rejeksiyonu — İngilizce "lead time" ya da "g" kısaltması yasak), sıra kart altındaki
       * açık sipariş satırıyla aynı sola yaslı hizalama sistemini korur. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2 text-[12px] text-muted-foreground">
        <span><span className="font-mono font-semibold text-foreground tabular-nums">{supplier.leadTimeDays !== null ? supplier.leadTimeDays : '—'}</span> gün tedarik</span>
        <span aria-hidden className="text-border">·</span>
        <span><span className="font-mono font-semibold text-foreground tabular-nums">{supplier.qualityScore ? Math.round(Number(supplier.qualityScore)) : '—'}/100</span> kalite</span>
        <span aria-hidden className="text-border">·</span>
        <span
          title={supplier.deliveryCount > 0 ? `Son ${supplier.deliveryCount} mal kabul` : 'Henüz mal kabul yok'}
          className={cn(
            // Tur 1 P1 tedarik-tedarikciler-01 kök neden: ham Tailwind paleti (emerald/amber/
            // red-600) tema/dark-mode token zincirinin dışındaydı — modülün geri kalanı (bkz.
            // critical-stock-table.tsx RISK_CLASS) `text-success`/`text-warning`/`text-destructive`
            // token sınıflarını kullanıyor.
            supplier.onTimeDeliveryPct !== null && (supplier.onTimeDeliveryPct >= 90 ? 'text-success' : supplier.onTimeDeliveryPct >= 70 ? 'text-warning' : 'text-destructive'),
          )}
        >
          <span className="font-mono font-semibold tabular-nums">{supplier.onTimeDeliveryPct === null ? '—' : `%${supplier.onTimeDeliveryPct}`}</span> zamanında
        </span>
        <span aria-hidden className="text-border">·</span>
        <span><span className="font-mono font-semibold text-foreground tabular-nums">{supplier.productCount}</span> ürün</span>
      </div>

      <div className="flex items-center justify-between border-t border-border/60 pt-2 text-[13px]">
        <span className="text-muted-foreground">{supplier.openPoCount} açık sipariş</span>
        <MoneyCell value={supplier.openPoValue} />
      </div>
    </div>
  );
}
