'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { DetailField, DetailGroupHeading, type DetailFieldGroup } from './detail-fields';

/**
 * `DetailFieldGroups`'un (detail-fields.tsx) sabit-ızgara varyantı — yeni bir dosya olarak eklendi,
 * ortak `detail-fields.tsx` DEĞİŞTİRİLMEDİ (bkz. rapor "sharedComponentRequests": asıl düzeltme orada
 * yapılmalı, `gridColsFor` tamamen kaldırılıp bu dosyanın davranışı tek kaynak olmalı).
 *
 * Tur 5 P1 bulgusu: `DetailFieldGroups`'taki `gridColsFor(n)` görünür alan SAYISINA göre sütun sayısını
 * değiştiriyordu — bir sayfada 4 alanlı bir grup 4 sütun, 2 alanlı bir grup 2 sütun kullanınca, alan sol
 * kenarları grup grup kayıyordu (ör. ürün detayında "Kayıt" grubunun "Son güncelleme"si hiçbir üst grup
 * alanıyla hizalanmıyordu). Linear ve Stripe TEK sabit ray kullanır — az alanlı bir grupta kalan hücreler
 * doğal boşluk olarak bırakılır; hizalama tutarlılığı sütun doluluğundan önce gelir.
 */
export function DetailFieldGroupsGrid({ groups, className }: { groups: DetailFieldGroup[]; className?: string }) {
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
            {/* Sabit ray: sayfa boyunca her grup aynı sütun sayısını kullanır. */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
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
