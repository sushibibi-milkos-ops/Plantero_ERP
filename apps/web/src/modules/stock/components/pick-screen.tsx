'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ScanLine, CheckCircle2, PackageCheck, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LotBadge } from '@/components/lot-badge';
import { ExpiryBadge } from '@/components/expiry-badge';
import { QtyCell } from '@/components/qty-cell';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useFocusMode } from '@/components/app-shell/use-focus-mode';
import { cn } from '@/lib/utils';
import { scanCodeAction, confirmPickAction } from '../actions';

export type PickLine = {
  id: string; productName: string; sku: string; qty: string; pickedQty: string; uomCode: string;
  lotId: string | null; lotNo: string | null; expiryDate: string | null; locationCode: string | null;
};

export function PickScreen({ deliveryId, docNo, initialLines }: { deliveryId: string; docNo: string; initialLines: PickLine[] }) {
  const router = useRouter();
  // Toplama tek görevli, kesintiye kapalı bir akıştır — kenar çubuğu + üst bar dikkat dağıtır ve
  // 1440px'te içeriği 448px'lik dar bir kolona sıkıştırır. Kabuksuz (odak modu) render edilir.
  useFocusMode();
  const [lines, setLines] = useState(initialLines);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pendingLines = useMemo(() => lines.filter((l) => Number(l.pickedQty) < Number(l.qty)), [lines]);
  const doneCount = lines.length - pendingLines.length;
  const current = pendingLines[0];

  async function handleScan() {
    const value = code.trim();
    if (!value || !current) return;
    setPending(true);
    try {
      if (current.lotId) {
        const scan = await scanCodeAction({ code: value });
        if (!scan.ok) {
          toast.error(scan.error);
          return;
        }
        const lotId = scan.data.kind === 'lot' ? scan.data.lot.id : null;
        if (!lotId) {
          toast.error('Bu bir lot kodu değil — beklenen: LOT:… veya lot numarası');
          return;
        }
        const res = await confirmPickAction({ deliveryId, lineId: current.id, scannedLotId: lotId });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
      } else {
        const res = await confirmPickAction({ deliveryId, lineId: current.id, scannedLotId: null });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
      }
      setLines((prev) => prev.map((l) => (l.id === current.id ? { ...l, pickedQty: l.qty } : l)));
      toast.success(`${current.productName} toplandı`);
      setCode('');
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  function skipCurrent() {
    if (!current) return;
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === current.id);
      if (idx === -1) return prev;
      const next = [...prev];
      const [line] = next.splice(idx, 1);
      if (!line) return prev;
      // Sırada bekleyenlerin sonuna taşınır (henüz toplanmadı, sadece sıradan çıkar) — operatörün
      // eksik/bulunamayan bir lotta akışta kilitlenmemesi için (Tur 3 P2 bulgusu).
      next.splice(pendingLines.length - 1, 0, line);
      return next;
    });
    toast.info(`${current.productName} atlandı — sırada bekleyenlere taşındı`);
    setCode('');
  }

  if (!current) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col justify-center space-y-4 py-6 text-center md:min-h-[calc(100dvh-3rem)]">
        <div className="grid size-16 place-items-center rounded-full bg-success/12 text-success mx-auto">
          <PackageCheck className="size-8" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Toplama tamamlandı</h2>
          <p className="text-sm text-muted-foreground">{docNo} irsaliyesindeki tüm satırlar toplandı.</p>
        </div>
        <Button size="lg" className="h-14 w-full text-base" onClick={() => router.push(`/depo/sevkiyat/${deliveryId}`)}>
          İrsaliyeye dön ve sevk et
        </Button>
      </div>
    );
  }

  // Sağ kolon (280px) yalnızca sırada bekleyen ≥2 satır varken render edilir — ama `lg:grid-cols-
  // [1fr_280px]` sabitti, boş kolonda bile 280px'lik ölü alan ayrılıyordu (Tur 4 P2 bulgusu). Grid
  // yalnızca gerçekten iki kolon gerektiğinde uygulanır.
  const hasQueue = pendingLines.length > 1;

  return (
    // Önceki sürüm dikeyde ortalanıyordu — masaüstünde başlığın üstünde 173px ölü alan bırakıyordu
    // (diğer depo ekranları içeriğe ~100px'te başlar, Tur 4 P2 bulgusu). Mobilde operatör ekranının
    // "elde tek bakışta" hissi için üstte bir miktar boşluk korunur (küçük pt), masaüstünde ise
    // sayfanın gerçek başlangıcına yakın (pt-10).
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 pt-4 md:pt-10 lg:max-w-3xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/depo/sevkiyat/${deliveryId}`)} className="h-11 px-2 text-muted-foreground">
          <ArrowLeft className="size-5" /> {docNo}
        </Button>
        <span className="text-sm font-medium tabular-nums text-muted-foreground">{doneCount}/{lines.length} toplandı</span>
      </div>

      {/* transform: scaleX yerine width — width bir layout property'dir ve her adımda reflow tetikler.
          scaleX yalnızca compositor'da çalışır. Track bg-border kullanır ki 0/N durumunda da (dolgu
          gerçekten sıfır genişlikte) bir "iz" görünsün — önceki sürümde minimum %2 dolgu yapay olarak
          "toplama başlamış" izlenimi veriyordu, boş durumla 1 satır toplanmış durumu ayırt edilemiyordu
          (Tur 4 P2 bulgusu).
          Kök neden (Tur 5 P2): %0'da (henüz hiç satır toplanmamışken) dolgu tam anlamıyla sıfır
          genişlikte render oluyordu — track (bg-border) ile ayrımı hiç kalmıyor, düz bir ayraçtan
          farksız görünüyordu, "durum çubuğu" olduğu belli olmuyordu. `min-w` doğrudan işe yaramaz
          (transform yalnızca render zamanında ölçekler, layout genişliği zaten %100 — min-width
          ölçeklenmiş boyuta uygulanmaz); bunun yerine oranın kendisi JS'te küçük bir tabana
          (%2.5) kenetlenir — reflow tetiklemeden her zaman görünür bir iz bırakır. */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full origin-left rounded-full bg-primary transition-transform duration-200 ease-out"
          style={{ transform: `scaleX(${lines.length ? Math.max(doneCount / lines.length, 0.025) : 0})` }}
        />
      </div>

      {/* Kök neden (Tur 5 P2): 2 kolonlu grid `hasQueue` (kuyrukta ≥1 öğe) ile tetikleniyordu — kuyrukta
          TEK öğe varken bile 1440px'te sağda ~280px'lik bir kolon ayrılıyor, tek satırlık liste orada
          asılı kalıyordu. Grid artık yalnızca kuyruk gerçekten kalabalıksa (>2 öğe) uygulanır; daha
          küçük kuyruklar tek kolonda, ana akışın altında akar (aşağıdaki panel `hasQueue` ile hâlâ
          ayrı gösterilir — yalnızca YAN YANA dizilme koşulu sıkılaştırıldı). */}
      <div className={cn(pendingLines.length - 1 > 2 && 'lg:grid lg:grid-cols-[1fr_280px] lg:items-start lg:gap-6')}>
        <div className="space-y-5">
          <div className="rounded-2xl border border-border/70 bg-card p-5">
            <div className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">Sıradaki satır</div>
            <div className="mb-1 text-xl font-semibold">{current.productName}</div>
            <div className="mb-4 font-mono text-sm text-muted-foreground">{current.sku}</div>
            <div className="flex flex-wrap items-center gap-2">
              {current.lotNo ? (
                // LotBadge artık kabuksuz (yalnızca mono metin — Tur 5 P1). Bu ekranda tek başına
                // duran lot rozeti, listedeki 200 tekrarlı çerçeve sorununun MUADİLİ değil — burada
                // odak noktası tek bir belirgin dokunma hedefi olması gerekiyor, bu yüzden kabuk
                // (border/bg/rounded) burada yerel olarak GERİ eklenir; md: sınıfları da masaüstünde
                // hep büyük hedef istediğinden açıkça ezilir.
                <LotBadge
                  lotNo={current.lotNo}
                  id={current.lotId ?? undefined}
                  className="h-11 rounded-md border border-border/70 bg-muted/40 px-3 text-[13px] hover:border-border hover:bg-muted md:h-11 md:px-3 md:text-[13px]"
                />
              ) : (
                <span className="text-sm text-muted-foreground">Lotsuz ürün</span>
              )}
              {current.expiryDate ? <ExpiryBadge date={current.expiryDate} /> : null}
            </div>
            {/* Lokasyon kodu (ör. TIRE/MAMUL/R01) tek satırda 2 sütunlu grid'e sığmıyordu (scrollWidth
                134px > clientWidth 128px, 390px'te) ve kırpılıyordu — yanlış raftan toplama riski. Tam
                genişlik tek satıra alındı; miktar altında ayrı bir satırda kalıyor. */}
            <div className="mt-4 space-y-2 text-sm">
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">Lokasyon</div>
                <div className="mt-0.5 font-mono text-[15px] font-medium break-all">{current.locationCode ?? '—'}</div>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">Miktar</div>
                <div className="mt-0.5"><QtyCell value={current.qty} uom={current.uomCode} className="text-base font-medium" /></div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <ScanLine className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleScan(); } }}
                placeholder={current.lotId ? 'Lot okut…' : 'Enter ile onayla…'}
                disabled={pending}
                className="h-14 pl-11 text-base font-mono"
              />
              {/* Operatör için sessiz bir klavye ipucu — barkod alanı zaten autoFocus, Enter'ın
                  "Onayla" ile eşdeğer olduğu açık değildi (Tur 4 P2 bulgusu). */}
              <div className="mt-1.5 pl-0.5 text-[11px] text-muted-foreground">Enter ile onayla</div>
            </div>
            <Button size="lg" className="h-14 w-full text-base" onClick={handleScan} disabled={pending}>
              <CheckCircle2 className="size-5" /> Onayla
            </Button>
            {/* Eksik/bulunamayan lotta operatörün yapabileceği hiçbir şey yoktu — akış kilitleniyordu
                (Tur 3 P2 bulgusu). Düz gövde metni gibi görünüyordu — çerçevesi/belirgin dokunma
                hedefi yoktu; oysa bu STOK SAYIMINI ETKİLEYEN (kısmi sevkiyat) bir aksiyon (Tur 4 P2
                bulgusu). Artık belirgin bir buton (h-11, destructive tonlu, hover'da dolgu). */}
            {/* Kök neden (Tur 5 P2): "Satırı atla" yıkıcı bir eylem (kısmi sevkiyata yol açabilir) ama
                tek tıkla, onaysız çalışıyordu — buton ağırlığı zaten destructive tonluydu, ama gerçek
                bir onay adımı ekranda hiç görünmüyordu. `ConfirmDialog` ile sarmalandı. */}
            {hasQueue ? (
              <Button variant="ghost" size="lg" className="h-11 w-full text-destructive/80 hover:bg-destructive/8 hover:text-destructive" onClick={() => setConfirmSkip(true)} disabled={pending}>
                Satırı atla — eksik/bulunamadı
              </Button>
            ) : null}
          </div>
        </div>

        {hasQueue ? (
          <div className="mt-5 pt-2 lg:mt-0 lg:pt-0">
            <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Sırada bekleyen ({pendingLines.length - 1})</div>
            <ul className="space-y-1.5">
              {pendingLines.slice(1).map((l) => (
                <li key={l.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground">
                  <span className="truncate">{l.productName}</span>
                  <QtyCell value={l.qty} uom={l.uomCode} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {lines.length === 0 ? <EmptyState compact title="Toplanacak satır yok" /> : null}

      <ConfirmDialog
        open={confirmSkip}
        onOpenChange={setConfirmSkip}
        title="Satırı atla"
        description={current ? `${current.productName} sırada bekleyenlerin sonuna taşınır — henüz toplanmamış sayılır ve kısmi sevkiyata yol açabilir.` : undefined}
        confirmLabel="Atla"
        destructive
        onConfirm={() => {
          skipCurrent();
          setConfirmSkip(false);
        }}
      />
    </div>
  );
}
