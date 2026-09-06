'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getVersionDetailAction, createNewVersionAction } from '../actions';
import { NewRecipeDialog } from './new-recipe-dialog';
import { CostSimulator } from './cost-simulator';
import { TRIAL_STATUS_LABELS } from '../labels';
import type { ProductOption, RecipeSummaryRow, VersionDetail, VersionListItem } from '../queries';

export function RecipeWorkspace({
  projectId, recipesWithVersions, productOptions, uomOptions, canManage, canRelease, initialDetail,
}: {
  projectId: string;
  recipesWithVersions: Array<{ recipe: RecipeSummaryRow; versions: VersionListItem[] }>;
  productOptions: ProductOption[];
  uomOptions: Array<{ id: string; code: string; name: string }>;
  canManage: boolean;
  canRelease: boolean;
  /** İlk seçili versiyonun sunucuda getirilmiş maliyet simülasyonu (bkz. receteler/page.tsx) —
   *  ilk render'da çıplak spinner yerine dolu panel gösterilsin diye. */
  initialDetail: VersionDetail | null;
}) {
  const router = useRouter();
  const [selectedRecipeId, setSelectedRecipeId] = useState(recipesWithVersions[0]?.recipe.id ?? null);
  const selectedGroup = recipesWithVersions.find((r) => r.recipe.id === selectedRecipeId) ?? recipesWithVersions[0] ?? null;
  const [selectedVersionId, setSelectedVersionId] = useState(selectedGroup?.recipe.currentVersionId ?? selectedGroup?.versions[0]?.id ?? null);
  const [detail, setDetail] = useState<VersionDetail | null>(initialDetail);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  // Sunucudan gelen initialDetail zaten selectedVersionId'yle eşleşiyorsa ilk effect çalışmasında
  // tekrar client fetch tetiklenmesin (kök neden düzeltmesi — bkz. yukarıdaki initialDetail notu).
  const skipInitialFetch = useRef(Boolean(initialDetail) && initialDetail?.version.id === selectedVersionId);

  useEffect(() => {
    if (!selectedVersionId) { setDetail(null); return; }
    if (skipInitialFetch.current) { skipInitialFetch.current = false; return; }
    setLoading(true);
    getVersionDetailAction({ versionId: selectedVersionId }).then((res) => {
      setLoading(false);
      if (res.ok) setDetail(res.data); else toast.error(res.error);
    });
  }, [selectedVersionId]);

  const versions = selectedGroup?.versions ?? [];

  async function newVersion() {
    if (!selectedGroup) return;
    setPending(true);
    const res = await createNewVersionAction({ projectId, recipeId: selectedGroup.recipe.id, copyFromVersionId: selectedVersionId ?? undefined });
    setPending(false);
    if (res.ok) {
      toast.success(`v${res.data.version} oluşturuldu`);
      setSelectedVersionId(res.data.versionId);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  if (recipesWithVersions.length === 0) {
    return (
      <EmptyState
        title="Bu proje için henüz deneme reçetesi yok"
        description="Versiyonlu bir deneme reçetesi oluşturup canlı maliyet simülasyonuna başlayın."
        action={canManage ? <NewRecipeDialog projectId={projectId} productOptions={productOptions} /> : undefined}
      />
    );
  }

  return (
    // gap-3 (mobil) / lg:gap-4: kök neden düzeltmesi (Tur 4 P1 arge-recete-18) — hedef maliyet
    // paneline kadarki dikey bütçeyi sıkmak için küçük ama gerçek bir kazanım (8pt ölçeğinde kalır).
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_1fr] lg:gap-4">
      {/* Mobil/tablet (< lg) TEK SATIRLIK araç çubuğu — kök neden düzeltmesi (Tur 4 P1 arge-recete-18,
          üç turdur açıktı): dikey reçete/versiyon listesi + iki tam-genişlik buton (sonra iki yatay
          satır) ilk ekranın çoğunu yiyordu. Doğal `<select>` en yoğun (44px'te tek satır) seçim
          birincili — özel pill listesi/segment YERİNE; "Yeni deneme reçetesi"/"Yeni versiyon" yalnız
          ikon (44×44) olarak AYNI satırda. Masaüstünde (lg+, aşağıdaki dikey sidebar) zaten bol dikey
          alan olduğu için burada değişiklik yok. */}
      <div className="flex items-center gap-2 lg:hidden">
        {recipesWithVersions.length > 1 ? (
          <select
            aria-label="Reçete"
            value={selectedRecipeId ?? ''}
            onChange={(e) => {
              const g = recipesWithVersions.find((x) => x.recipe.id === e.target.value);
              setSelectedRecipeId(e.target.value);
              setSelectedVersionId(g?.recipe.currentVersionId ?? g?.versions[0]?.id ?? null);
            }}
            className="h-11 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2.5 text-[13px]"
          >
            {recipesWithVersions.map((g) => (<option key={g.recipe.id} value={g.recipe.id}>{g.recipe.name}</option>))}
          </select>
        ) : null}
        {versions.length > 0 ? (
          <select
            aria-label="Versiyon"
            value={selectedVersionId ?? ''}
            onChange={(e) => setSelectedVersionId(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2.5 text-[13px]"
          >
            {versions.map((v) => {
              const status = TRIAL_STATUS_LABELS[v.status] ?? { label: v.status, tone: 'muted' as const };
              return <option key={v.id} value={v.id}>{`v${v.version} · ${status.label}`}</option>;
            })}
          </select>
        ) : null}
        {canManage ? (
          <>
            <NewRecipeDialog projectId={projectId} productOptions={productOptions} compact triggerClassName="shrink-0" />
            {selectedGroup ? (
              <Button variant="outline" size="icon" className="size-11 shrink-0" onClick={newVersion} disabled={pending} aria-label="Yeni versiyon">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Masaüstü (lg+) dikey sidebar — orijinal düzen, değişmedi. */}
      <div className="hidden space-y-3 lg:block">
        {recipesWithVersions.length > 1 ? (
          <div className="space-y-1">
            {recipesWithVersions.map((g) => (
              <button
                key={g.recipe.id}
                type="button"
                onClick={() => { setSelectedRecipeId(g.recipe.id); setSelectedVersionId(g.recipe.currentVersionId ?? g.versions[0]?.id ?? null); }}
                className={cn('flex min-h-0 w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px]', g.recipe.id === selectedRecipeId ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted')}
              >
                {g.recipe.name}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="text-[13px] font-medium text-muted-foreground">{selectedGroup?.recipe.name}</h2>
        )}

        {canManage ? <NewRecipeDialog projectId={projectId} productOptions={productOptions} /> : null}

        <div className="space-y-1 border-t border-border/60 pt-2">
          <p className="px-2.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Versiyonlar</p>
          {versions.map((v) => {
            const status = TRIAL_STATUS_LABELS[v.status] ?? { label: v.status, tone: 'muted' as const };
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVersionId(v.id)}
                className={cn('flex min-h-0 w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px]', v.id === selectedVersionId ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60')}
              >
                <span>v{v.version}</span>
                <StatusBadge status={v.status} label={status.label} tone={status.tone} size="sm" />
              </button>
            );
          })}
        </div>

        {canManage && selectedGroup ? (
          <Button variant="outline" size="sm" className="h-8 w-full" onClick={newVersion} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />} Yeni versiyon
          </Button>
        ) : null}
      </div>

      <div className="min-w-0 rounded-xl border border-border/60 bg-card p-3 md:p-4">
        {loading || !detail ? (
          <CostSimulatorSkeleton />
        ) : (
          <CostSimulator detail={detail} projectId={projectId} productOptions={productOptions} uomOptions={uomOptions} canManage={canManage} canRelease={canRelease} />
        )}
      </div>
    </div>
  );
}

/**
 * Versiyon değiştirilirken (client fetch — ilk açılışta artık kullanılmıyor, bkz. initialDetail)
 * gösterilen iskelet: CostSimulator ile AYNI ölçüde (hedef çubuğu + 4 form alanı + 6×39px tablo
 * satırı) — çıplak spinner'ın 194px→982px panel sıçramasını önler (Tur 3 P1 criterion-7).
 */
function CostSimulatorSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Versiyon yükleniyor">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>
      <div className="space-y-2 rounded-lg border border-border/60 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-1 w-full rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border/60">
        {/* Gerçek başlık şeridiyle eşit: 12px, normal-case, zemin yok — yalnız alt hairline (Tur 4
            P1 arge-recete-23, cost-simulator.tsx'teki aynı düzeltme). */}
        <div className="flex h-9 items-center gap-4 border-b border-border/60 px-3">
          {['Ürün', 'Miktar', 'Maliyet kaynağı', 'Birim maliyet', 'Fire %', 'Satır maliyeti'].map((h) => (
            <span key={h} className="flex-1 max-w-28 truncate text-[12px] font-medium text-muted-foreground">{h}</span>
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, r) => (
          <div key={r} className="flex h-9 items-center gap-4 border-b border-border/40 px-3 last:border-0">
            {Array.from({ length: 6 }).map((_, c) => (
              <Skeleton key={c} className="h-3 flex-1 max-w-28" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
