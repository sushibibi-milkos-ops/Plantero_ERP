'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export type DetailFieldRow = { label: string; value: unknown; node: React.ReactNode };
export type DetailFieldGroup = { title: string; fields: DetailFieldRow[] };

/** Tek bir alan: küçük muted etiket üstte, değer altta. Boşsa (`empty`) soluklaşır. */
export function DetailField({ label, children, empty }: { label: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className={cn('space-y-0.5', empty && 'opacity-60')}>
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}

export function DetailGroupHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="border-t border-border/60 pt-3 text-[13px] font-semibold">{children}</h3>;
}

/** Görünür alan sayısına göre sütun sayısı — az alanlı bir bölüm 4 sütunluk ızgarada yarısı boş
    kalmasın diye kendi alan sayısını aşmaz (bkz. Tur 3 P1 — ürün/cari detay ızgara tutarsızlığı). */
function gridColsFor(n: number): string {
  if (n <= 1) return 'grid-cols-1';
  if (n === 2) return 'grid-cols-2';
  if (n === 3) return 'grid-cols-2 sm:grid-cols-3';
  return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
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
    <div className={cn('space-y-4', className)}>
      {groups.map((g) => {
        const visible = g.fields.filter((f) => showEmpty || f.value);
        if (visible.length === 0) return null;
        return (
          <div key={g.title} className="space-y-3">
            <DetailGroupHeading>{g.title}</DetailGroupHeading>
            <div className={cn('grid gap-x-6 gap-y-3', gridColsFor(visible.length))}>
              {visible.map((f) => (
                <DetailField key={f.label} label={f.label} empty={!f.value}>
                  {f.node}
                </DetailField>
              ))}
            </div>
          </div>
        );
      })}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowEmpty((s) => !s)}
          className="text-[12px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          {showEmpty ? 'Boş alanları gizle' : `Boş alanları göster (${hiddenCount})`}
        </button>
      ) : null}
    </div>
  );
}
