'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { InsetRow, InsetSection } from './inset-list';

export type DetailFieldRow = { label: string; value: unknown; node: React.ReactNode };
export type DetailFieldGroup = { title: string; fields: DetailFieldRow[] };

/** Tek bir alan: inset-grouped satır (etiket solda gri, değer sağda). Boşsa (`empty`) soluklaşır.
 *  Yalnızca `InsetSection` içinde kullanılmalıdır. */
export function DetailField({ label, children, empty }: { label: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <InsetRow label={label} empty={empty}>
      {children}
    </InsetRow>
  );
}

export function DetailGroupHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 px-4 text-[13px] font-medium tracking-[0.2px] text-muted-foreground uppercase">{children}</h3>;
}

/**
 * Ürün/cari gibi ana veri detay sekmelerindeki "etiket üstte / değer altta" alan ızgarası.
 * Tur 3 P1 bulgusu: product-general-tab ve partner-general-tab aynı deseni ayrı ayrı, farklı
 * genişlik ve sütun sayısıyla uyguluyordu (880px/3 sütun vs 1152px/4 sütun) — burada birleştirildi.
 * Boş alanlar varsayılan gizli; "Boş alanları göster" bağlantısı tüm grupları birlikte açar/kapatır.
 */
export function DetailFieldGroups({ groups, className }: { groups: DetailFieldGroup[]; className?: string }) {
  const [showEmpty, setShowEmpty] = useState(false);
  const hiddenCount = groups.reduce((acc, g) => acc + g.fields.filter((f) => !f.value).length, 0);

  return (
    <div className={cn(className)}>
      {/* iPad: geniş ekranda iki sütunlu gruplu listeler (kutular bölünmez), mobilde tek sütun */}
      <div className="lg:columns-2 lg:gap-x-5">
        {groups.map((g) => {
          const visible = g.fields.filter((f) => showEmpty || f.value);
          if (visible.length === 0) return null;
          return (
            <InsetSection key={g.title} title={g.title}>
              {visible.map((f) => (
                <DetailField key={f.label} label={f.label} empty={!f.value}>
                  {f.node}
                </DetailField>
              ))}
            </InsetSection>
          );
        })}
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowEmpty((s) => !s)}
          // Kök neden (Tur 20 P1, /kalite/kontroller/[id]): Tur 10'daki shell-empty-fields-toggle-01
          // düzeltmesi bu dosyaya DEĞİL, `detail-field-groups-grid.tsx` içindeki `DetailFieldGroupsGrid`
          // varyantına uygulanmıştı — masaüstü ana-veri sayfaları (ürün/cari) o varyantı kullandığı için
          // düzeltilmiş görünüyordu, ama `check-detail.tsx` (kalite modülü) hâlâ BU dosyadaki orijinal
          // `DetailFieldGroups`'u kullanıyor ve düğme ~18px yükseklikte kalmıştı (44px dokunma hedefinin
          // çok altında). Aynı yastık deseni (`min-h-11 py-3` mobilde, `-mx-3 px-3` görsel hizayı bozmadan
          // dışa değil içe büyüsün diye) buraya da uygulandı — görsel yükseklik değişmedi.
          className="-mx-3 flex min-h-11 items-center px-3 py-3 text-[13px] text-primary hover:opacity-70 md:mx-0 md:min-h-0 md:px-0 md:py-0"
        >
          {showEmpty ? 'Boş alanları gizle' : `Boş alanları göster (${hiddenCount})`}
        </button>
      ) : null}
    </div>
  );
}
