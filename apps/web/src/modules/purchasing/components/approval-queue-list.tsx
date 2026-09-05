'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Sparkles, CheckCircle2, XCircle, ArrowRight, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { MoneyCell } from '@/components/money-cell';
import { formatDateTime, formatQty } from '@/lib/format';
import { approvePurchaseOrderAction, rejectPurchaseOrderAction } from '../actions';
import type { ApprovalQueueRow } from '../queries';

/**
 * Onay kuyruğu — kart ızgarası + klavye kısayolları (docs/modules/tedarik.md §2: "Onayla / Düzenle /
 * Reddet, klavye kısayolları animasyonsuz"). Seçili kart `j`/`k` (veya ↓/↑) ile gezilir; `a` onaylar,
 * `r` reddeder, `e`/`Enter` düzenlemeye (sipariş detayına) götürür. Seçim halkası (`ring`) anlık
 * uygulanır — geçiş/animasyon YOK (kısayol tepkisi gecikmeli hissettirmemeli, bkz. `.claude/skills/animate`).
 */
export function ApprovalQueueList({ items }: { items: ApprovalQueueRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (selected >= items.length) setSelected(Math.max(0, items.length - 1));
  }, [items.length, selected]);

  const approve = useCallback(async (orderId: string) => {
    setBusyId(orderId);
    const res = await approvePurchaseOrderAction({ id: orderId });
    setBusyId(null);
    if (res.ok) {
      toast.success('Taslak onaylandı');
      startTransition(() => router.refresh());
    } else toast.error(res.error);
  }, [router, startTransition]);

  const reject = useCallback(async (orderId: string) => {
    setBusyId(orderId);
    const res = await rejectPurchaseOrderAction({ id: orderId, reason: null });
    setBusyId(null);
    if (res.ok) {
      toast.success('Taslak reddedildi');
      startTransition(() => router.refresh());
    } else toast.error(res.error);
  }, [router, startTransition]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!items.length) return;
      const current = items[selected];
      if (!current) return;
      if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowDown') { e.preventDefault(); setSelected((i) => Math.min(i + 1, items.length - 1)); }
      else if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowUp') { e.preventDefault(); setSelected((i) => Math.max(i - 1, 0)); }
      else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); void approve(current.orderId); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); void reject(current.orderId); }
      else if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') { e.preventDefault(); router.push(`/satin-alma/siparisler/${current.orderId}`); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items, selected, approve, reject, router]);

  if (!items.length) {
    // Tur 2 P1 tedarik-onay-04 kök neden: bu boş durum ekranın NORMAL kararlı hali (kuyrukta
    // bekleyen taslak yokken her gün görülür) ama hiçbir eylem sunmuyordu — kullanıcı "taslak yok"
    // bilgisini alıp çıkmaza giriyordu, oysa taslak üreten motor bir tık ötede. `action` yuvasına
    // kritik stok motorunu çalıştıracağı ekrana giden birincil buton eklendi.
    return (
      <EmptyState
        icon={Sparkles}
        title="Onay bekleyen taslak yok"
        description="Kritik stok motoru yeni bir taslak önerdiğinde burada görünür."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/satin-alma/kritik-stok">Kritik stok motorunu çalıştır</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Tur 4 P1 tedarik-onay-07 kök neden (kısmi): kbd ipuçları tek-seferlik 10px taşıyordu —
       * modülün geri kalanı (bkz. /satin-alma/siparisler PageHeader description) en fazla 4 boyut
       * (24/14/13/12) kullanırken bu ekranda 10px BEŞİNCİ bir kademe açıyordu. Açık boyut yok,
       * çevredeki `text-xs` (12px) etiket kademesini DEVRALIR (kbd üzerinde ayrı boyut sınıfı yok). */}
      <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
        <Keyboard className="size-3.5" />
        <span className="flex items-center gap-1"><kbd className="rounded bg-muted px-1 py-0.5 font-mono">j</kbd>/<kbd className="rounded bg-muted px-1 py-0.5 font-mono">k</kbd> gezin</span>
        <span className="flex items-center gap-1"><kbd className="rounded bg-muted px-1 py-0.5 font-mono">a</kbd> onayla</span>
        <span className="flex items-center gap-1"><kbd className="rounded bg-muted px-1 py-0.5 font-mono">r</kbd> reddet</span>
        <span className="flex items-center gap-1"><kbd className="rounded bg-muted px-1 py-0.5 font-mono">e</kbd> düzenle</span>
      </div>

      {/* Tur 3 P1 tedarik-onay-05 kök neden: `sm:grid-cols-2 xl:grid-cols-3` yalnızca kuyruk ≥2-3
       * taslak taşırken sütunları doldurur — kuyrukta 1 (ya da 2) bekleyen taslak varken (günün
       * büyük kısmı) grid yine de tam genişliği eşit sütunlara böler, kart kendi sütununa (376px)
       * sıkışıp kalır ve içerik sütununun %69'u kalıcı olarak boş kalır. Linear'in triyaj kutusu
       * gibi tam genişlikte istiflenmiş satırlara geçildi — kart sayısı ne olursa olsun ana
       * sütunun tamamını kullanır (oran ≈1); onay kartının kendisi zaten (tarih/gerekçe/kalemler/
       * eylemler) yatay şeritler halinde kurulu olduğu için genişlemesi boşluk üretmiyor. */}
      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <div
            key={item.approvalId}
            onClick={() => setSelected(i)}
            // Tur 4 P1 tedarik-onay-06 kök neden: seçim durumu `border-primary ring-primary`
            // kullanıyordu — birincil renk (--primary) aynı ekranda "Onayla" butonuyla da
            // taşınıyordu, seçili kart zaten onaylanmış gibi okunuyordu. `ring-ring`/`outline-ring`
            // (DataTable'ın satır odağı gibi) DENENMEDİ — bu tema `--ring`'i `--primary` ile AYNI
            // yeşile eşitliyor (globals.css:98/136), token adı farklı olsa da piksel rengi birebir
            // aynı kalır, sorun ÇÖZÜLMEZ (yalnızca sınıf adı değişir). Seçim artık gerçekten
            // RENKSİZ/nötr: `--accent` (kroma ~0, gri) arka plan + `--foreground` tabanlı ince
            // kenarlık — ekranda yeşil YALNIZCA "Onayla" butonunda kalır.
            className={`flex flex-col gap-3 rounded-xl border p-4 ${i === selected ? 'border-foreground/15 bg-accent/60' : 'border-border/60'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {/* Tur 4 P1 tedarik-onay-06: Sparkles ("AI taslağı" işareti) `text-primary`
                   * taşıyordu — üçüncü bir --primary rolü. Bilgi rozeti muted/secondary tona iner,
                   * --primary yalnızca birincil eyleme (Onayla) ayrılır. */}
                  <Sparkles className="size-3.5 shrink-0 text-muted-foreground" aria-label="AI taslağı" />
                  {/* Tur 4 P1 tedarik-onay-07 kök neden: baslık satırı 14px (text-sm) iken kartın
                   * geri kalanı (kalem satırı, AI gerekçesi) 13px — aynı rolde iki gövde boyutu.
                   * Kart artık TEK gövde boyutu (13px) konuşuyor; touch hedefi Tur 4 P2 tedarik-onay-08
                   * (`max-sm:min-h-11` — replenishment-panel.tsx'teki checkbox kalıbıyla aynı teknik:
                   * kök yalnızca dokunma hedefini büyütür, `-my-3` çevre satırların boyunu korur). */}
                  <Link href={`/satin-alma/siparisler/${item.orderId}`} className="inline-flex max-sm:min-h-11 max-sm:items-center max-sm:-my-3 truncate font-mono text-[13px] font-medium hover:underline">{item.docNo}</Link>
                </div>
                <div className="mt-0.5 flex items-baseline gap-1.5 text-[13px] text-muted-foreground">
                  {/* min-w-0 + truncate: cari adı küçülür, kalem sayısı (shrink-0) her genişlikte
                   * TAM görünür kalır — Tur 1 P1 tedarik-onay-03 kök neden: önceden tek bir truncate
                   * akışında birleşiyordu, 520px kart genişliğinde '· 1 kalem' tamamen kesiliyordu. */}
                  <span className="min-w-0 truncate">{item.partnerName}</span>
                  <span className="shrink-0">· {item.lineCount} kalem</span>
                </div>
              </div>
              {/* Tur 4 P1 tedarik-onay-07: tutar `text-base` (16px) — modülde başka HİÇBİR yerde
               * kullanılmayan tek-seferlik bir kademe. Liste-tutarı kademesine (13/600 tabular,
               * /satin-alma/siparisler'deki `grandTotal` sütunuyla aynı görünür boyut) oturtuldu. */}
              <MoneyCell value={item.grandTotal} className="shrink-0 text-[13px] font-semibold" />
            </div>

            {item.linePreview.length ? (
              <ul className="space-y-1 border-t border-border/60 pt-2.5 text-[13px]">
                {item.linePreview.map((l, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-foreground">{l.productName}</span>
                    <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{formatQty(l.qty, l.uomCode)}</span>
                    <MoneyCell value={l.lineTotal} className="w-20 shrink-0" />
                  </li>
                ))}
                {item.lineCount > item.linePreview.length ? (
                  <li className="text-xs text-muted-foreground">+{item.lineCount - item.linePreview.length} kalem daha</li>
                ) : null}
              </ul>
            ) : null}

            {item.aiRationale ? <p className="line-clamp-3 text-[13px] text-muted-foreground">{item.aiRationale}</p> : null}

            {/* Tur 1 P0 tedarik-onay-01 kök neden: `justify-between` + `shrink-0` buton grubu 390px'te
             * kartın sağ kenarını 32px aşıyordu (buton grubu asla küçülmüyordu). Mobilde satır tek
             * kolona düşer, buton grubu tam genişlik alır (`w-full`, `grid-cols-3` — üç eylem eşit
             * pay); masaüstünde (`sm:`) eski yatay şerit geri gelir. Buton yüksekliği de aynı kök
             * nedenle mobilde 44px'e çıkar (Tur 1 P1 tedarik-onay-02): `h-11 sm:h-8`. */}
            <div className="flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}{item.aiConfidence ? ` · %${Math.round(Number(item.aiConfidence) * 100)} güven` : ''}</span>
              <div className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center">
                <Button size="sm" variant="ghost" className="h-11 text-muted-foreground hover:text-destructive sm:h-8" disabled={busyId === item.orderId} onClick={() => reject(item.orderId)}>
                  <XCircle className="size-3.5" /> Reddet
                </Button>
                <Button size="sm" variant="outline" className="h-11 sm:h-8" asChild>
                  <Link href={`/satin-alma/siparisler/${item.orderId}`}>Düzenle <ArrowRight className="size-3.5" /></Link>
                </Button>
                <Button size="sm" className="h-11 sm:h-8" disabled={busyId === item.orderId} onClick={() => approve(item.orderId)}>
                  <CheckCircle2 className="size-3.5" /> Onayla
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
