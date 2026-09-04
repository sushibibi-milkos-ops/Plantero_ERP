'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flexRender, type Table } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { DataTableRowActions } from './row-actions';
import type { RowAction } from './types';

// SSR sırasında useLayoutEffect konsola uyarı basar (DOM yok) — istemci tarafında layout-öncesi
// (boyamadan önce, titreşimsiz) çalışması gerektiği için yalnızca tarayıcıda gerçek layout effect,
// sunucuda no-op'a (useEffect, hiç çalışmaz çünkü bu bileşen zaten yalnızca tarayıcıda hidrasyon
// sonrası ölçüm yapar) düşer.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** `formatDate` çıktısı (CLAUDE.md kural 8: her yerde dd.MM.yyyy) — bir meta bit'in metni bu
 *  desenle BAŞLIYORSA "tarih" sayılır. */
const DATE_PREFIX = /^\d{2}\.\d{2}\.\d{4}/;

function isDateLikeNode(node: React.ReactNode): boolean | null {
  if (typeof node === 'string') return DATE_PREFIX.test(node);
  if (typeof node === 'number') return false;
  return null; // düz metin değil (ör. tarih + gecikme rozeti birlikte) — DOM'dan okunacak
}

/**
 * Mobil kart satır-2 meta zinciri ("· bit · bit"): alan yetmezse bit'ler TEK TEK, TAMAMEN
 * düşürülür — asla yarım/harf-ortası kesilmez (Tur 4 P2 kök neden düzeltmesi,
 * shell-mobile-card-meta-clip-02). Önceki kalım tüm bit'leri TEK bir `text-ellipsis` metin
 * akışında birleştiriyordu: taşma her zaman akışın SONUNDA kesiliyordu — bu bit'lerin çoğunda
 * (tarih İLK bit olacak şekilde yazılmış tablolarda) doğru davranıyordu ama tarihin İKİNCİ/SON
 * bit olduğu tablolarda (ör. tahsilat "Yön · Tarih") tarihin kendisini "03.09.202…" diye
 * yarım kesiyordu. Artık bit'ler ayrı ayrı ölçülür: taşma varsa EN SONDAKİ "tarih-olmayan" bit
 * (metni dd.MM.yyyy ile başlamayan) tamamen kaldırılır — tarih metni bulunan bit'ler bu düşürme
 * için ADAY SAYILMAZ, yalnızca gerçekten hiçbir tarih-olmayan bit kalmayınca (nadir) döngü durur.
 */
function MetaChain({ items, leadingSeparator }: { items: { key: string; node: React.ReactNode }[]; leadingSeparator: boolean }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef(new Map<string, HTMLSpanElement>());
  // Tek kalan (düşürülemeyen, tarih içeren) bir bit KENDİ İÇİNDE karma içerik taşıyorsa (ör.
  // "tarih + gecikme rozeti" TEK meta hücresinde, invoices-table.tsx) ve hâlâ sığmıyorsa, o
  // hücrenin alt öğeleri üzerinde uygulanan imperatif `display:none` — React'ın kendi render'ı
  // DEĞİL, bu yüzden itemsKey değişince (satır verisi değişti) elle geri alınmalı.
  const shrunkElsRef = useRef<HTMLElement[]>([]);
  const itemsKey = items.map((it) => it.key).join('|');
  const [hiddenKeys, setHiddenKeys] = useState<ReadonlySet<string>>(() => new Set());

  // Satır içeriği değiştiyse (farklı satır/veri) önceki gizleme kararlarını (üst seviye bit +
  // alt-öğe) unut.
  useIsoLayoutEffect(() => {
    setHiddenKeys(new Set());
    shrunkElsRef.current.forEach((el) => el.style.removeProperty('display'));
    shrunkElsRef.current = [];
  }, [itemsKey]);

  useIsoLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (container.scrollWidth <= container.clientWidth) return;
    const visible = items.filter((it) => !hiddenKeys.has(it.key));
    for (let i = visible.length - 1; i >= 0; i--) {
      const it = visible[i]!;
      const known = isDateLikeNode(it.node);
      const dateLike = known ?? DATE_PREFIX.test((itemRefs.current.get(it.key)?.textContent ?? '').replace(/^\s*·\s*/, ''));
      if (dateLike) continue;
      const key = it.key;
      setHiddenKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      return;
    }
    // Üstteki döngü hiçbir "tarih-olmayan" ÜST SEVİYE bit bulamadı — genelde tek, karma bir
    // meta hücresi kaldığı içindir (ör. dueDate hücresi kendi içinde `<span>tarih</span><span>N
    // gün gecikti</span>` taşır, invoices-table.tsx). Tek bit tamamen düşürülürse TARİH DE
    // giderdi — bunun yerine o bit'in KENDİ alt öğeleri sondan başlayarak tek tek (bütün olarak,
    // yarım değil) gizlenir; tarih her zaman en soldaki/en derindeki dal olduğundan bu adım asla
    // tarihi silmez, yalnızca yanındaki ikincil rozet/metni kaldırır.
    if (visible.length === 1) {
      const rootEl = itemRefs.current.get(visible[0]!.key);
      let guard = 0;
      while (rootEl && container.scrollWidth > container.clientWidth && guard < 8) {
        guard++;
        let node: Element = rootEl;
        let hidOne = false;
        for (let depth = 0; depth < 8; depth++) {
          // `aria-hidden="true"` atlanır: bu, bit'in kendi "·" ayracı (aşağıdaki render'da, satır
          // ~119) — bit İÇERİĞİ değil. Kök neden (Tur 18 P1 shell-mobile-card-meta-chain-drop-01):
          // ayracı filtrelemeden `rootEl`in çocukları sayılınca ayraç + tek gerçek içerik (ör.
          // invoices-table.tsx dueDate hücresinin <tarih><gecikme rozeti> sarmalayıcısı) birlikte
          // `kids.length===2` (>1) sayılıyor, algoritma SONUNCUYU (o TEK içerik sarmalayıcısının
          // TAMAMINI — tarihi de rozeti de) tek seferde `display:none` yapıyordu; geriye yalnızca
          // sahipsiz bir "·" kalıyordu. Ayraç filtrelenince rootEl'in TEK gerçek çocuğu bulunur
          // (kids.length===1) ve İÇİNE inilir — gizleme ancak bir sonraki (gerçekten çok-çocuklu)
          // seviyede, o düğümün SON çocuğunda (ör. yalnızca rozet) olur; tarih hiçbir zaman ayraçla
          // birlikte toptan silinmez, bu da aynı zamanda sahipsiz ayracı da imkânsız kılar.
          const kids = Array.from(node.children).filter(
            (c) => (c as HTMLElement).style.display !== 'none' && c.getAttribute('aria-hidden') !== 'true',
          ) as HTMLElement[];
          if (kids.length > 1) {
            const last = kids[kids.length - 1]!;
            last.style.display = 'none';
            shrunkElsRef.current.push(last);
            hidOne = true;
            break;
          } else if (kids.length === 1) {
            node = kids[0]!;
          } else {
            break;
          }
        }
        if (!hidOne) break;
      }
    }
    // `text-ellipsis` (aşağıdaki className) bir son çare olarak devrede kalır — yukarıdaki adımlar
    // tükenip hâlâ sığmıyorsa (çok nadir) en azından "…" ile işaretlenir, harf ortası kesilmez.
  }, [hiddenKeys, items, itemsKey]);

  const visibleItems = items.filter((it) => !hiddenKeys.has(it.key));

  return (
    <span ref={containerRef} className="max-w-[55%] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap">
      {visibleItems.map((it, i) => (
        <span
          key={it.key}
          ref={(el) => {
            if (el) itemRefs.current.set(it.key, el);
            else itemRefs.current.delete(it.key);
          }}
        >
          {leadingSeparator || i > 0 ? <span aria-hidden className="text-muted-foreground/40"> · </span> : null}
          {it.node}
        </span>
      ))}
    </span>
  );
}

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
            {/* Satır 1: başlık solda, rozet(ler) + aksiyon menüsü sağda.
                gap-1.5 (6px, gap-2/8px değil — Tur 6 P1 aynı bulgunun ikinci yarısı): rozet yuvasına
                taban font boyutu (yukarıda) eklendikten SONRA bile 2+ rozetli satırlarda (ör.
                payments-table.tsx Yön+Durum) başlık kolonu flex-1 olarak yalnızca 125px'e düşüyor,
                bazı belge no'ları (14px, sw 126-128px) 1-3px farkla hâlâ kırpılıyordu — üç gap
                (başlık→rozet1, rozet1→rozet2, rozet2→aksiyon) toplamda 24px alıyordu. 6px'e
                indirilince kazanılan 6px başlığa geçer (cw 125→131), üç harfli/geniş belge no'ları
                da sığar; rozetler arası ayrım (StatusBadge kendi dolgusu + nokta zaten görsel sınır
                veriyor) 6px'te de okunur kalır, dokunma hedefleri (aksiyon 44px) etkilenmez. */}
            <div className="flex items-center gap-1.5">
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
                // text-[11px] leading-4 (Tur 6 P1 shell-mobile-card-badge-slot-fontsize-01 kök neden):
                // bu yuva hiçbir zaman kendi font boyutunu tanımlamıyordu — StatusBadge kendi
                // text-[11px]'ini taşıdığı için bugüne kadar sorun görünmüyordu, ama düz metin bir hücre
                // (ör. payments-table.tsx "Yön" sütunu, mobile:'badge') buraya girince gövdenin 16px
                // varsayılanını miras alıyordu: kartın EN BÜYÜK metni oluyor, başlıktan (14px) ve
                // StatusBadge'den (11px) büyük basılıp hiyerarşiyi tersine çeviriyordu (bkz.
                // /muhasebe/tahsilatlar — 17/17 kartta başlık scrollWidth > clientWidth, belge no
                // kırpılıyordu). Taban artık StatusBadge'in kendi ölçeğiyle (11px) birebir aynı —
                // rozet yuvasına giren HER içerik (rozet bileşeni veya düz metin) aynı büyüklükte kalır.
                <div key={b.id} className="max-w-[45%] shrink-0 overflow-hidden text-[11px] leading-4">
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
                    // `max-w-[55%]` (Tur 16): alt başlık YOKSA (ör. /muhasebe/banka mutabakat listesi
                    // — tarih + karşı taraf adı ikisi de 'meta', 'subtitle' yok) meta zinciri TEK
                    // başına satırın tamamını serbestçe kaplayıp metrik (tutar) sütununu ezmesin diye
                    // üst sınır konur. Bit'lerin KENDİSİ artık `MetaChain` ölçüp tek tek düşürüyor
                    // (Tur 4 P2 kök neden düzeltmesi, shell-mobile-card-meta-clip-02 — bkz. bileşen
                    // yorumu): eski kalıp tüm bit'leri TEK `text-ellipsis` akışında birleştirip
                    // taşmayı akışın SONUNDA harf-ortası kesiyordu; tarihin İKİNCİ/SON bit olduğu
                    // tablolarda (ör. tahsilat "Yön · Tarih") bizzat TARİHİ "03.09.202…" diye
                    // yarım basıyordu. `MetaChain` bit'leri metinlerine göre tanır: dd.MM.yyyy ile
                    // başlayan bit'ler düşürme adayı SAYILMAZ, yalnızca tarih-olmayan bit'ler (ör.
                    // "Tahsilat"/"Ödeme" yön etiketi) alan yetmezse TAMAMEN kaldırılır.
                    <MetaChain
                      items={metaCells.map((c) => ({ key: c.id, node: flexRender(c.column.columnDef.cell, c.getContext()) }))}
                      leadingSeparator={Boolean(subtitle)}
                    />
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
