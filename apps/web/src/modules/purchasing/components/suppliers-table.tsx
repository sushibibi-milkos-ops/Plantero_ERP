'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { MoneyCell } from '@/components/money-cell';
import { DataTable, type ColumnDef, type DataTableFilter } from '@/components/data-table';
import { cn } from '@/lib/utils';
import { setSupplierWhitelistAction } from '../actions';
import type { SupplierCardRow } from '../queries';

/**
 * Tur 4 P1 tedarik-tedarikciler-08/09/10 kök neden: bu ekran modülün TEK liste ekranıydı ama kendi
 * kart ızgarasını (arama/filtre/sayaç YOK, kayıt başına ~58.000px²) elle çiziyordu — modülün geri
 * kalanı (`/satin-alma/kritik-stok`, `/satin-alma/siparisler`) zaten paylaşılan `DataTable`'ı
 * kullanıyor. Kök çözüm YENİ bir kart tasarımı İCAT ETMEK değil, ekranı da aynı ortak bileşene
 * taşımak: araç çubuğu (arama+filtre+sayaç), satır yoğunluğu (36px) ve tipografi (13px tek gövde
 * kademesi) otomatik gelir; "ayraçla başlayan sarılmış satır" (tedarikciler-10) sorunu da kendiliğinden
 * ortadan kalkar (artık flex-wrap bir metrik şeridi yok — tablo hücreleri).
 *
 * Tur 5 P0 tedarik-tedarikciler-11 kök neden: `name` sütunu özel bir `cell` TANIMLAMIYORDU —
 * DataTable ham metni doğrudan basıyordu, bu da (productName/preferredSupplierName sütunlarındaki
 * AYNI kök nedenin bir tekrarı, bkz. critical-stock-table.tsx notu) `white-space:nowrap` altında
 * uzun tedarikçi adlarının (ör. "Proteinsan Gıda Hammaddeleri Ltd. Şti.") td'nin `meta.width`
 * İPUCUNU (220px) aşıp tabloyu 1205px'e genişletmesine yol açıyordu — kabın (1152px) 53px dışına
 * taşan bu fazlalık son sütunu ('Açık tutar') kırpıyordu. Diğer sütunlardaki aynı kalıpla (bounded
 * inline-block + truncate + title) düzeltildi.
 */
export function SuppliersTable({ suppliers, canManageWhitelist }: { suppliers: SupplierCardRow[]; canManageWhitelist: boolean }) {
  const columns = useMemo<ColumnDef<SupplierCardRow, unknown>[]>(
    () => [
      {
        // width 220 -> 320 (Tur 6 P1 tedarik-tedarikciler-18): ekranın kimlik sütunu 6/6 satırda
        // kırpıktı (en fazla 135px gizli); genişlik, kardeş sütunlardan (aşağıda) alınan payla büyütüldü.
        id: 'name', accessorFn: (r) => r.name, header: 'Tedarikçi', meta: { width: 320, mobile: 'title' },
        // w-[296px] = meta.width(320) - td dolgusu(24) — bkz. yukarıdaki dosya notu.
        cell: ({ row }) => <span className="inline-block max-w-full truncate align-bottom md:w-[296px]" title={row.original.name}>{row.original.name}</span>,
      },
      { accessorKey: 'code', header: 'Kod', meta: { width: 88, mobile: 'subtitle', className: 'font-mono text-xs' } },
      {
        // Beyaz liste hem bir FİLTRE hem bir sütun — değer 'true'/'false' (arrIncludesSome ile
        // eşleşen filtre seçenekleri), hücre canManageWhitelist'e göre ya Switch ya salt-okunur rozet.
        // mobile:'hidden' KALDI — bu sütunun mobil görünümü artık aşağıdaki `renderMobileCard`
        // (özel kart) tarafından, satırın en üstünde ayrı bir alanla, dokunma hedefi kırpılmadan
        // veriliyor (Tur 5 P1 tedarik-tedarikciler-12): generic 'meta'/'badge' yuvalarının ikisi de
        // (MetaChain kendi `overflow-hidden`i, rozet yuvası `leading-4` sabit yüksekliği) 44px'lik
        // bir anahtarı dikeyde kırpar — bkz. `WhitelistCell` notu.
        id: 'whitelisted', accessorFn: (r) => (r.isPurchaseWhitelisted ? 'true' : 'false'), header: 'Beyaz liste', meta: { width: 72, align: 'center', mobile: 'hidden', noSort: true },
        cell: ({ row }) => <WhitelistCell supplier={row.original} canManage={canManageWhitelist} />,
      },
      { accessorKey: 'leadTimeDays', header: 'Tedarik süresi', meta: { align: 'right', width: 110, mobile: 'hidden' }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{row.original.leadTimeDays !== null ? `${row.original.leadTimeDays} gün` : '—'}</span> },
      { accessorKey: 'qualityScore', header: 'Kalite', meta: { align: 'right', width: 80, mobile: 'hidden' }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums">{row.original.qualityScore ? `${Math.round(Number(row.original.qualityScore))}/100` : <span className="text-muted-foreground">—</span>}</span> },
      {
        // Tur 6 P1 tedarik-tedarikciler-17 kök neden: yeşil bu ekranda iki anlama geliyordu — beyaz
        // liste anahtarı (durum) VE bu sütundaki '%100' (veri). success/warning/destructive üçlüsü
        // kaldırıldı; değer artık nötr (yalnızca <70 uyarı için destructive kalır — bu kırmızı, yeşille
        // ÇAKIŞMAZ), ekranda yeşil taşıyan tek semantik rol anahtarda kalır.
        accessorKey: 'onTimeDeliveryPct', header: 'Zamanında', meta: { align: 'right', width: 100, mobile: 'hidden' },
        cell: ({ row }) => {
          const v = row.original.onTimeDeliveryPct;
          return (
            <span
              title={row.original.deliveryCount > 0 ? `Son ${row.original.deliveryCount} mal kabul` : 'Henüz mal kabul yok'}
              className={cn('font-mono text-[13px] tabular-nums', v === null ? 'text-muted-foreground' : v < 70 ? 'text-destructive' : 'text-foreground')}
            >
              {v === null ? '—' : `%${v}`}
            </span>
          );
        },
      },
      { accessorKey: 'productCount', header: 'Ürün', meta: { align: 'right', width: 64, mobile: 'hidden' }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{row.original.productCount}</span> },
      { accessorKey: 'openPoCount', header: 'Açık sipariş', meta: { align: 'right', width: 80, mobile: 'hidden' }, cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{row.original.openPoCount}</span> },
      { accessorKey: 'openPoValue', header: 'Açık tutar', meta: { align: 'right', width: 130, mobile: 'hidden' }, cell: ({ row }) => <MoneyCell value={row.original.openPoValue} muted={Number(row.original.openPoValue) === 0} /> },
    ],
    [canManageWhitelist],
  );

  const filters: DataTableFilter[] = [
    { columnId: 'whitelisted', title: 'Beyaz liste', options: [{ value: 'true', label: 'Beyaz listede' }, { value: 'false', label: 'Beyaz listede değil' }] },
  ];

  return (
    <DataTable
      columns={columns}
      data={suppliers}
      getRowId={(r) => r.id}
      rowHref={(r) => `/ana-veri/cariler/${r.id}`}
      searchPlaceholder="Tedarikçi, kod ara…"
      filters={filters}
      initialSorting={[{ id: 'name', desc: false }]}
      emptyTitle="Tedarikçi yok"
      emptyDescription="Ana veri'den tedarikçi tanımlayın."
      // Tur 5 P1 tedarik-tedarikciler-12/14 kök neden: DataTable'ın GENERİK mobil kart kalıbı (kolon
      // meta.mobile'a göre title/subtitle/badge/meta/rest) bu tabloda İKİ yapısal soruna çarpıyordu —
      // (1) 'badge'/'meta' yuvalarının ikisi de kendi `overflow-hidden`/`leading-4` sabit yüksekliğiyle
      // 44px'lik bir dokunma hedefini (anahtar) dikeyde kırpardı, (2) tek bir 'meta' hücresi ("0")
      // sütun başlığı bağlamından koptuğunda etiketsiz kalıyordu (tedarik-tedarikciler-14). Özel bir
      // kart (`renderMobileCard`) hem anahtarı kırpmadan üst satıra koyar hem de kalan sayıları
      // ("84/100", "%92", "3 açık sipariş") tek, etiketli bir metin akışında verir — hiçbir paylaşılan
      // dosya (`mobile-cards.tsx`) değiştirilmeden.
      renderMobileCard={(r) => (
        <div className="rounded-lg border border-border/70 bg-card p-2.5">
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1 truncate text-[14px] leading-5 font-medium">{r.name}</div>
            <WhitelistCell supplier={r} canManage={canManageWhitelist} />
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              <span className="font-mono">{r.code}</span>
              {r.qualityScore ? ` · ${Math.round(Number(r.qualityScore))}/100` : ''}
              {r.onTimeDeliveryPct !== null ? ` · %${r.onTimeDeliveryPct}` : ''}
              {` · ${r.openPoCount} açık sipariş`}
            </span>
            <MoneyCell value={r.openPoValue} muted={Number(r.openPoValue) === 0} className="shrink-0 text-[13px] tabular-nums" />
          </div>
        </div>
      )}
    />
  );
}

/**
 * Tur 5 P1 tedarik-tedarikciler-13 kök neden: paylaşılan `ui/switch.tsx`in "açık" arka planı
 * `data-[state=checked]:bg-primary`e SABİTLİ — bu bileşenin `className` prop'u yalnızca KÖK
 * (`SwitchPrimitive.Root`, dokunma hedefi) sınıflarına karışır, görsel izi (iç `<span>`) hiçbir
 * dışarıdan sınıfla ezilemez (kural 2: paylaşılan dosya değiştirilemez). Bu sütunda AYNI anda 6
 * anahtar görünür oluyor — hepsi doygun primary basınca ekranın "tek eylem = tek vurgu rengi"
 * kuralını (kardeş rotalarda ölçülen primary-arka-planlı eleman sayısı = 1) kırıyor, vurgu rengi
 * bir EYLEM değil bir VERİ DURUMU taşımaya başlıyor. Çözüm: Radix'in çıplak `Switch` primitifi
 * doğrudan bu modülden içe aktarılıp (paylaşılan sarmalayıcı ATLANARAK, hiçbir shell dosyası
 * değiştirilmeden) kendi doygun OLMAYAN tonuyla (`bg-success/55`) yeniden çizildi — a11y (role,
 * aria-checked, klavye) Radix'ten aynen gelir, yalnızca renk modüle özel.
 *
 * Dokunma hedefi: paylaşılan `ui/switch.tsx`nin KENDİ deseni birebir uygulanıyor — kök
 * (`SwitchPrimitive.Root`, gerçek `<button role="switch">`) yalnızca dokunma hedefidir
 * (`min-h-11 min-w-11`, `md:` altında `min-h-8 min-w-8`), görsel iz (renkli oval) köke ayrı, iç
 * bir `<span>`e taşınmıştır. Boyutu KÖKTEN AYRI bir sarmalayıcıya (ör. `<span>`) vermek YANLIŞ
 * olurdu: tıklama olayı gerçek `<button>` üzerinde başlamalı, dolgu alanına tıklamak sarmalayıcının
 * KENDİSİNE gider, anahtarı hiç TETİKLEMEZ (ilk denemede ölçüldü — bkz. commit geçmişi). 32px
 * (tedarik-tedarikciler-15) / 44px (tedarik-tedarikciler-12) hedefi CSS breakpoint'iyle ayrılır:
 * mobil kart yalnızca <768px render edilir, masaüstü tablo yalnızca ≥768px.
 */
function WhitelistCell({ supplier, canManage }: { supplier: SupplierCardRow; canManage: boolean }) {
  const [whitelisted, setWhitelisted] = useState(supplier.isPurchaseWhitelisted);
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return (
      <span className={cn('text-[13px]', whitelisted ? 'text-success' : 'text-muted-foreground')}>
        {whitelisted ? 'Evet' : 'Hayır'}
      </span>
    );
  }

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

  return (
    // Satır tıklanabilir (cari detayına gider) — switch'in kendi tıklaması satır navigasyonunu
    // TETİKLEMEMELİ (stopPropagation), aksi halde beyaz liste her değiştirildiğinde cari detayına
    // yönlenirdi (suppliers-table.tsx'in önceki kart sürümüyle aynı kök çözüm). stopPropagation
    // gerçek `<button>`ın (Root) KENDİSİNDE — bir sarmalayıcıda DEĞİL, aksi halde dolgu alanına
    // tıklamak satır tıklamasını durdurmadan (yanlış elemana) giderdi.
    <SwitchPrimitive.Root
      checked={whitelisted}
      onCheckedChange={toggle}
      onClick={(e) => e.stopPropagation()}
      disabled={pending}
      aria-label={`${supplier.name} beyaz liste`}
      // Tur 6 P1 tedarik-tedarikciler-16 kök neden: dokunma hedefi kökü (`min-h-11`, 44px) mobil
      // kartın üst satırını 44px'e şişiriyordu — görsel iz yalnızca 24x14 (approval-queue-list.tsx:135
      // ile AYNI kalıp: `-my-3` kökün ÇEVRESİNE negatif dikey marj verir, satırın akış yüksekliğini
      // görsel ize geri döndürür, dokunma alanının KENDİSİ 44x44 kalır — ikisi çelişmiyor). `md:my-0`
      // masaüstü tablo hücresindeki (`td h-9 align-middle`) yerleşimi değiştirmez.
      className="peer -my-3 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:my-0 md:min-h-8 md:min-w-8"
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none flex h-3.5 w-6 shrink-0 items-center rounded-full border border-transparent transition-colors',
          whitelisted ? 'bg-success/55' : 'bg-input',
        )}
      >
        <SwitchPrimitive.Thumb className={cn('pointer-events-none block size-3 rounded-full bg-background shadow-xs transition-transform', whitelisted ? 'translate-x-[calc(100%-2px)]' : 'translate-x-0')} />
      </span>
    </SwitchPrimitive.Root>
  );
}
