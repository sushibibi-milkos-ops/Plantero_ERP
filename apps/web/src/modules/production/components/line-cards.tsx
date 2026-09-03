import Link from 'next/link';
import { Factory, CircleCheck, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { QtyCell } from '@/components/qty-cell';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Sparkline } from '@/components/sparkline';
import { cn } from '@/lib/utils';
import { formatQty, formatDate } from '@/lib/format';
import { D } from '@plantero/core';
import type { LineCardRow } from '../queries';

const STATUS_TONE: Record<'running' | 'idle', { label: string; className: string }> = {
  running: { label: 'Çalışıyor', className: 'bg-success/12 text-success' },
  idle: { label: 'Boşta', className: 'bg-muted text-muted-foreground' },
};

export function LineCards({ lines }: { lines: LineCardRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {lines.map((line) => {
        const running = Boolean(line.activeWorkOrder && line.activeWorkOrder.status === 'in_progress');
        const paused = Boolean(line.activeWorkOrder && line.activeWorkOrder.status === 'paused');
        const tone = paused ? { label: 'Duraklatıldı', className: 'bg-warning/15 text-[oklch(0.5_0.14_70)] dark:text-warning' } : STATUS_TONE[running ? 'running' : 'idle'];
        const producedPct = line.activeWorkOrder ? Math.min(100, D(line.activeWorkOrder.producedQty).div(D(line.activeWorkOrder.plannedQty).eq(0) ? 1 : line.activeWorkOrder.plannedQty).mul(100).toNumber()) : 0;

        // Günlük kapasite = kapasite/saat × vardiya dakikası ÷ 60. OEE (kullanılabilirlik×performans×
        // kalite) formülü henüz doğrulanmadığından (bkz. rapor) burada ham "doluluk" oranı gösterilir:
        // bugün üretilen ÷ günlük kapasite. Yanıltıcı bir OEE% göstermek yerine dürüst bir oran.
        const dailyCapacity = line.capacityPerHour ? D(line.capacityPerHour).mul(line.shiftMinutes).div(60) : null;
        const fillPct = dailyCapacity && dailyCapacity.gt(0) ? Math.round(Math.min(999, D(line.todayProducedQty).div(dailyCapacity).mul(100).toNumber())) : null;
        // Sparkline: eğri var olduğu sürece gösterilir (bkz. "Son 7 gün" bloğu altta) — delta rozeti
        // yalnızca eğri VE hesaplanmış bir değişim ikisi de varken anlamlı, yoksa "önceki 7 güne göre
        // değişim" iddiası veri yokken de basılıp (HAT3) çelişki yaratıyordu (Tur 10 bulgusu, P1).
        const hasSparklineData = line.sparkline.some((v) => v > 0);
        const showDelta = hasSparklineData && line.sparklineDeltaPct !== null;

        return (
          <div key={line.id} className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              {/* block min-h-11 py-0.5: kartın geri kalanı tıklanabilir değil, bu bağlantı kartın
                  birincil navigasyon hedefi — önceden 40px'e düşüyordu (Tur 10 bulgusu, P1). Metin
                  hizası (satır yükseklikleri) değişmeden hit alanı 44px'e çıkar. */}
              <Link href={`/uretim/is-emirleri?hat=${line.code}`} className="group block min-h-11 min-w-0 py-0.5" data-pressable>
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{line.code}</div>
                <div className="text-base font-semibold group-hover:underline group-hover:decoration-border group-hover:underline-offset-2">{line.name}</div>
              </Link>
              <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium', tone.className)}>
                <span aria-hidden className={cn('size-1.5 rounded-full', running ? 'bg-success' : paused ? 'bg-warning' : 'bg-muted-foreground/50')} />
                {tone.label}
              </span>
            </div>

            {line.activeWorkOrder ? (
              // Çerçevesiz: yalnızca zemin farkı (bg-muted/30) ayrım için yeterli — dış kart zaten
              // çerçeveli, iç içe iki çerçeve gereksizdi (Tur 2 bulgusu).
              <Link href={`/uretim/is-emirleri/${line.activeWorkOrder.id}`} className="space-y-2 rounded-lg bg-muted/30 p-3 hover:bg-muted/50" data-pressable>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{line.activeWorkOrder.docNo}</span>
                  <StatusBadge status={line.activeWorkOrder.status} kind="work_order" size="sm" />
                </div>
                <div className="truncate text-sm font-medium">{line.activeWorkOrder.productName}</div>
                {/* opacity-60 kaldırıldı: 0/70'te düz gri bir çizgi ayraçtan ayırt edilemiyordu (Tur 2
                    bulgusu) — hairline yükseklik + altında birleşik "0 / 70 ADET (%0)" etiketi. */}
                <Progress value={producedPct} className="h-1.5" />
                <div className="text-xs text-muted-foreground">
                  <QtyCell value={line.activeWorkOrder.producedQty} /> / <QtyCell value={line.activeWorkOrder.plannedQty} uom={line.activeWorkOrder.uomCode} /> (%{Math.round(producedPct)})
                </div>
              </Link>
            ) : (
              // dashed border kaldırıldı: /uretim/hatlar ve /uretim/is-emirleri/yeni'de aynı "burada
              // bir şey yok" klişesi tekrarlanıyordu (Tur 2 bulgusu) — üst hairline yeterli ayrım.
              <div className="flex flex-1 flex-col items-center justify-center gap-2 border-t border-border/60 pt-4 pb-1 text-center">
                <Factory className="size-5 text-muted-foreground/60" strokeWidth={1.5} />
                <span className="text-xs text-muted-foreground">Aktif iş emri yok</span>
                {/* h-11 md:h-8: 32px'lik sm düğme mobilde 44px dokunma eşiğinin altındaydı — boş
                    kartın tek eylemi (Tur 5 bulgusu, P1; data-table/toolbar.tsx'teki kalıpla aynı). */}
                <Button variant="outline" size="sm" className="h-11 md:h-8" asChild>
                  <Link href="/uretim/planlama">Bu hatta iş emri planla</Link>
                </Button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-center">
              {/* title: "Bugün (hat)" hattın günlük toplam üretimi mi yoksa aktif iş emrinki mi
                  belirsizdi (Tur 3 bulgusu, P2) — üstteki aktif iş emri ilerlemesinden ayrı bir
                  ölçü olduğu açıklama ile netleşir. */}
              <Metric label="Bugün (hat)" value={<QtyCell value={line.todayProducedQty} uom={line.todayUomCode} className="justify-center text-sm font-semibold" />} title="Hattın bugünkü toplam üretimi (tüm iş emirleri)" />
              {/* Üç metrik tek kalıba indirildi: değer `text-sm font-semibold tabular-nums`,
                  birim daima ayrı, soluk `ml-0.5 text-[11px]` span (QtyCell'in birim kalıbıyla
                  aynı) — eskiden "80/sa" ve "%3" birimi değerle aynı ağırlıkta ya da önde
                  yazıyordu, göz sütunları karşılaştıramıyordu (Tur 4 bulgusu, P2). */}
              {/* Yüzde ön ek: Türkçede % son ek değil ön ektir — sayfanın kendi alt başlığı ("ort.
                  doluluk %1"), iş emri detayı, liste, planlama tooltip'i ve operatör ekranı hep bu
                  kartı istisna bırakıyordu (Tur 5 bulgusu, P1). */}
              <Metric label="Doluluk" value={<span className="num text-sm font-semibold">{fillPct === null ? '—' : `%${fillPct}`}</span>} />
              <Metric
                label="Kapasite"
                value={
                  <span className="num text-sm font-semibold">
                    {line.capacityPerHour ? formatQty(line.capacityPerHour, undefined, { maxDigits: 0 }) : '—'}
                    {line.capacityPerHour ? <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">/sa</span> : null}
                  </span>
                }
              />
            </div>

            {/* Son 7 gün: veri olsun olmasın daima render edilir — HAT3'te tüm değerler 0 diye
                bölüm hiç çizilmiyordu, üç kart farklı satır sayısına düşüp metrik satırları
                yatayda hizasız kalıyordu (Tur 4 bulgusu, P1). Veri yokken Sparkline yerine sabit
                boyutlu (88×24) kutuda ortalanmış "Veri yok" metni — eski hairline+"—" çipi kopuk
                bir çizgi gibi okunuyordu (Tur 5 bulgusu, P2). Delta rozeti (KpiCard'daki deltaNode
                kalıbıyla aynı): çıplak bir eğri hangi büyüklükte olduğunu söylemiyordu (Tur 5
                bulgusu, P1) — önceki 7 güne göre değişim, sparkline'ın hemen solunda. */}
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border/60 pt-3">
              <span className="text-[11px] tracking-wide text-muted-foreground uppercase">Son 7 gün</span>
              <div className="flex items-center gap-1.5">
                {/* showDelta: delta rozeti "önceki 7 güne göre değişim" iddia eder — sparkline'ın
                    kendisi hiç üretim göstermiyorsa (tüm günler 0) bu iddia anlamsız, "Veri yok" ile
                    aynı satırda çelişki yaratıyordu (ör. HAT3'te ↘%100 + "Veri yok" yan yana, Tur 10
                    bulgusu, P1). Eğri varken delta da hesaplanmışsa ikisi birlikte, eğri yokken tek
                    "Veri yok" — üç kart aynı düzende. */}
                {showDelta ? <SparklineDelta pct={line.sparklineDeltaPct!} /> : null}
                {hasSparklineData ? (
                  <Sparkline data={line.sparkline} width={88} height={24} tone="muted" />
                ) : (
                  <div className="flex h-6 w-[88px] items-center justify-center text-[11px] text-muted-foreground" title="Son 7 günde üretim yok">
                    Veri yok
                  </div>
                )}
              </div>
            </div>
            {line.lastClosedWorkOrder ? (
              <div className="flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                {/* Asma kilit erişim/güvenlik anlamı taşır, kapatılmış bir iş emrini değil — etiket
                    ("Son kapatılan:") zaten kendini açıklıyor; ikon anlamı doğru bir işaretle
                    değiştirildi (Tur 5 bulgusu, P2). */}
                <CircleCheck className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate">
                  Son kapatılan: <span className="text-foreground">{line.lastClosedWorkOrder.productName}</span>
                </span>
                <span className="ml-auto shrink-0 font-mono text-[11px]">{formatDate(line.lastClosedWorkOrder.closedAt)}</span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Metric({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div title={title}>
      {/* text-[11px]: 10px okunabilirlik tabanının (Linear'da 11px) altındaydı (Tur 2 bulgusu). */}
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

/** "Son 7 gün" sparkline'ının delta rozeti — `KpiCard`'daki `deltaNode` kalıbıyla aynı ton/ikon
 *  mantığı (yükseliş=success, düşüş=destructive, düz=nötr); üretimde artış varsayılan olarak
 *  olumlu sayılır (`invertDelta` yok — hattın hedefe göre iyi/kötü olduğu burada bilinmiyor). */
function SparklineDelta({ pct }: { pct: number }) {
  const dir = pct === 0 ? 'flat' : pct > 0 ? 'up' : 'down';
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums',
        dir === 'flat' && 'bg-muted text-muted-foreground',
        dir === 'up' && 'bg-success/12 text-success',
        dir === 'down' && 'bg-destructive/10 text-destructive',
      )}
      title="Önceki 7 güne göre"
    >
      <Icon className="size-3" />
      %{Math.abs(pct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
    </span>
  );
}
