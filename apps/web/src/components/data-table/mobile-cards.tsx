'use client';

import { flexRender, type Table } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { DataTableRowActions } from './row-actions';
import type { RowAction } from './types';

/** Hücrenin ham (accessor) değeri gerçekten boş mu — `getValue()` render edilmiş düğümden değil
 *  KAYNAK veriden okur, bu yüzden "—" gösteren bir hücre bile (ör. sıfır bakiye) burada boş SAYILMAZ:
 *  yalnızca gerçekten null/undefined/'' olan alanlar (veri hiç yok) elenir. */
function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * Mobil kart görünümü: sütun meta'sına göre başlık/alt başlık/rozet/satır düzeni.
 * Özel `renderCard` verilirse o kullanılır.
 *
 * Kök neden (Tur 10 P1 shell-mobile-card-height-01): önceki kalıp 4 dikey katman üretiyordu
 * (başlık, alt başlık, etiketsiz meta satırı, N alanlık `<dl>`) — 99-118px, puan kartı hedefinin
 * (56-72px) çok üzerinde. Kalıp artık EN FAZLA 2 katman üretir: satır 1 başlık + rozetler, satır 2
 * alt başlık + (varsa) boş olmayan meta ipuçları + TEK metrik (kalan alanların SONUNCUSU — tablo
 * tanımlarında en önemli/parasal alan sona konur, bkz. partners-table balance, boms-table unitCost,
 * products-table listPrice). Diğer "rest" alanları mobil kartta artık hiç gösterilmez — özet karttan
 * tam alan listesi değil, detay sayfasına gitmek için yeterli bağlam beklenir. Boş değerli meta
 * hücreleri (`getValue()` null/undefined/'') satıra hiç eklenmez.
 */
export function DataTableMobileCards<T>({
  table,
  onRowClick,
  rowActions,
  renderCard,
}: {
  table: Table<T>;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => RowAction<T>[];
  renderCard?: (row: T) => React.ReactNode;
}) {
  const rows = table.getRowModel().rows;
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        if (renderCard) {
          return (
            <li key={row.id} onClick={() => onRowClick?.(row.original)}>
              {renderCard(row.original)}
            </li>
          );
        }
        const cells = row.getVisibleCells().filter((c) => c.column.id !== '__actions');
        const title = cells.find((c) => c.column.columnDef.meta?.mobile === 'title') ?? cells[0];
        const subtitle = cells.find((c) => c.column.columnDef.meta?.mobile === 'subtitle');
        const badges = cells.filter((c) => c.column.columnDef.meta?.mobile === 'badge');
        // 'meta': masaüstünde `hidden` olan ama kartta bağlam için gerekli alanlar (hat, tarih…) —
        // boş olanlar hiç eklenmez (Tur 10 P1).
        const metaCells = cells.filter((c) => c.column.columnDef.meta?.mobile === 'meta' && !isEmptyValue(c.getValue()));
        const rest = cells.filter((c) => c !== title && c !== subtitle && !badges.includes(c) && c.column.columnDef.meta?.mobile !== 'meta' && c.column.columnDef.meta?.mobile !== 'hidden');
        // Tek metrik: kalan alanların sonuncusu (tablo tanımında en sona konan alan modül genelinde
        // tutarlı biçimde en "parasal"/önemli alandır — bkz. yukarıdaki not).
        const metric = rest.length ? rest[rest.length - 1]! : null;
        const actions = rowActions?.(row.original) ?? [];
        // Satır 2 sol taraf: alt başlık + boş olmayan meta ipuçları. Tur 16 P1 düzeltmesi
        // (shell-mobile-card-meta-clip-01, Tur 15'te açıldı) ÖNCESİ bu tek bir düz metin akışıydı — alt başlık
        // (cari adı/açıklama) satırın tamamını doldurduğunda arkasından gelen meta bit'leri
        // (tarih, yön) kırpmanın İÇİNDE kalıyor, ya harf ortasından kesiliyor ya da tamamen
        // kayboluyordu (bkz. /muhasebe/yevmiye — 50/50 kartta tarih hiç görünmüyordu). Artık
        // öncelik açık: alt başlık `hasLeftContent` içinde AYRI, küçülebilir (`min-w-0 flex-1
        // truncate`) bir kutu; meta bit'leri (tarih/yön gibi sabit genişlikli) `shrink-0` ikinci
        // bir kutuda — asla küçülmez, asla kırpılmaz. Alt başlık gerekirse sıfıra kadar küçülür,
        // meta her zaman tam görünür.
        const hasLeftContent = Boolean(subtitle) || metaCells.length > 0;
        return (
          <li
            key={row.id}
            onClick={() => onRowClick?.(row.original)}
            className={cn(
              // p-2.5 (p-3 değil): 2 satırlık kalıpta 12px dolgu bazı rotalarda (rozet+badge satırı
              // beklenenden birkaç px taşan) kartı 72px hedefinin hemen üstüne taşıyordu — 10px hâlâ
              // rahat, referans aralığın (56-72px) içinde güvenli pay bırakır.
              'rounded-lg border border-border/70 bg-card p-2.5',
              onRowClick && 'cursor-pointer active:bg-accent/50',
            )}
          >
            {/* Satır 1: başlık solda, rozet(ler) + aksiyon menüsü sağda. */}
            <div className="flex items-center gap-2">
              {/* min-w-0 + overflow-hidden: bu kolon rozet/aksiyon sütunlarıyla flex'te paylaşılıyor,
                  min-w-0 olmadan içerik hiç küçülmeden kart genişliğini zorluyordu. `truncate` yalnızca
                  DÜZ METİN çocuklar için çalışır (text-overflow yalnızca bloğun kendi metnini keser);
                  hücre kendi flex/inline-flex sarmalayıcısıyla geliyorsa (ör. LotBadge, "ad + rozet"
                  span'ı) tarayıcı üç nokta basamıyor, içerik sert kesiliyordu (Tur 4 P1 bulgusu — bkz.
                  stock-table.tsx Ürün sütunu, lots-table.tsx LotBadge). `[&>*]:min-w-0 [&>*]:truncate`
                  doğrudan çocuk bir ELEMENT ise (metin değil) ona da aynı kırpma kuralını zorlar. */}
              {/* leading-5 (20px): text-[14px] boyut ipucu olmadan gelir, satır yüksekliği gövdenin
                  1.5 varsayılanına (21px) düşerdi — kartı 72px hedefinin (kriter 3) hemen üstüne
                  taşıyordu (72.5px ölçüldü). */}
              <div className="min-w-0 flex-1 truncate text-[14px] leading-5 font-medium [&>*]:min-w-0 [&>*]:max-w-full [&>*]:truncate">
                {title ? flexRender(title.column.columnDef.cell, title.getContext()) : null}
              </div>
              {badges.map((b) => (
                // max-w-[45%]: uzun bir rozet metni (ör. "10 gün önce doldu · 24.08.2026") başlık
                // sütununu (lot no/ürün adı) neredeyse sıfıra indirebiliyordu (Tur 4 P0 bulgusu) —
                // rozet kartın en fazla yarısını alır, kalan başlık sütununa geçer.
                <div key={b.id} className="max-w-[45%] shrink-0 overflow-hidden">
                  {flexRender(b.column.columnDef.cell, b.getContext())}
                </div>
              ))}
              {actions.length ? <DataTableRowActions row={row.original} actions={actions} /> : null}
            </div>
            {/* Satır 2: alt başlık (+ meta ipuçları) solda, tek metrik sağda — kalıp burada durur.
                Kök neden (Tur 11 P1 shell-mobile-card-truncate-01): sol grup önceden `flex` bir
                sarmalayıcıydı ve her "bit" kendi `inline-flex` span'ine sarılıyordu — `text-overflow:
                ellipsis` yalnızca DÜZ (block/inline, flex/inline-flex DEĞİL) bir kutunun kendi metin
                akışını keser; iç içe inline-flex'lerde tarayıcı "…" hiç basmadan glifi sert kesiyordu
                (/depo/skt SKU "307020000" son "0" yarım, /depo/mal-kabul tedarikçi adı son harf yarım)
                — ayrıca `justify-between gap-2` metric'e görünürde yalnızca ~4px bırakıyordu çünkü
                taşan içerik konteynerin GENİŞLİĞİNİ zaten dolduruyordu. Sol grup artık TEK bir düz
                (flex olmayan) metin akışı: tüm bit'ler ("·" ayraçlarıyla) aynı satırda yan yana basılır,
                kesme tek noktada (grubun sonunda) "…" ile olur — `gap-2` artık metric'e gerçek ≥8px
                boşluk bırakır çünkü sol grup kendi genişliğine (flex-1, min-w-0) düzgün küçülür. */}
            {hasLeftContent || metric ? (
              <div className="mt-0.5 flex items-baseline justify-between gap-2">
                {/* `mobile-card-subtitle-row` işaretçisi (Tur 14 P2 shell-mobile-card-height-02):
                    bu satır zaten kartın kendi `<li>`sinin (tam kart tıklanabilir/dokunulabilir alan)
                    içinde — LotBadge gibi bağlantılı hücrelerin KENDİ 44px dokunma-hedefi dolgusu
                    (h-11) burada gereksiz, satır 2'yi 44px'e şişirip kart toplamını 72px hedefinin
                    üzerine taşıyor (LotBadge bkz. lot-badge.tsx, aynı sınıf altında h-auto'ya döner).
                    İki alt kutuya ayrılmış (Tur 16): alt başlık KÜÇÜLÜR, meta bit'leri KÜÇÜLMEZ. */}
                <div className="mobile-card-subtitle-row flex min-w-0 flex-1 items-baseline text-xs text-muted-foreground">
                  {subtitle ? (
                    <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {flexRender(subtitle.column.columnDef.cell, subtitle.getContext())}
                    </span>
                  ) : null}
                  {metaCells.length ? (
                    // `max-w-[55%]` (Tur 16 ek düzeltme, ölçümle bulundu): alt başlık YOKSA
                    // (ör. /muhasebe/banka mutabakat listesi — tarih + karşı taraf adı ikisi de
                    // 'meta', 'subtitle' yok) meta zinciri TEK başına satırın tamamını serbestçe
                    // kaplayıp metrik (tutar) sütununu eziyordu (Playwright bbox: metaRight >
                    // metricLeft, 11 karttan 2'sinde). Üst sınır meta zincirinin normal tek-tarih
                    // durumunda (< 55%) hiçbir şeyi değiştirmez — yalnızca uzun ikinci/üçüncü meta
                    // bit'i (serbest metin, ör. karşı taraf adı) taşarsa devreye girer ve o KENDİSİ
                    // kırpılır; bit'ler tarih-önce sırayla yazıldığından (bkz. sütun tanımları)
                    // kırpma her zaman SONDAKİ (daha az kritik) bit'i keser, tarihi değil.
                    <span className="max-w-[55%] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap">
                      {metaCells.map((c, i) => (
                        <span key={c.id}>
                          {subtitle || i > 0 ? <span aria-hidden className="text-muted-foreground/40"> · </span> : null}
                          {flexRender(c.column.columnDef.cell, c.getContext())}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </div>
                {metric ? (
                  <div className="shrink-0 text-[13px] tabular-nums">{flexRender(metric.column.columnDef.cell, metric.getContext())}</div>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
