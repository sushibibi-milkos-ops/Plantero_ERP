'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { DetailField, type DetailFieldGroup } from './detail-fields';
import { InsetSection } from './inset-list';

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
    <div className={cn(className)}>
      {/* iPadOS inset grouped: her grup beyaz yuvarlak bir kart; lg+ iki sütun (kartlar bölünmez). */}
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
          // Tur 10 P1 shell-empty-fields-toggle-01: buton önceden yalnızca metin satırı yüksekliğinde
          // (~18px) idi — mobil dokunma hedefi 44px'in yarısından küçüktü. min-h-11 + py-3 dokunma
          // yastığını büyütür, -mx-3 (yatay) buton kutusunun sol kenarını görsel metinle hizalı tutar
          // (yastık dışa değil içe doğru büyümüş gibi görünür).
          className="-mx-3 flex min-h-11 items-center px-3 py-3 text-[13px] text-primary hover:opacity-70 md:mx-0 md:min-h-0 md:px-0 md:py-0"
        >
          {showEmpty ? 'Boş alanları gizle' : `Boş alanları göster (${hiddenCount})`}
        </button>
      ) : null}
    </div>
  );
}
