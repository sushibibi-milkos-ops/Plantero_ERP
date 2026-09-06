'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getVersionDetailAction, createNewVersionAction } from '../actions';
import { NewRecipeDialog } from './new-recipe-dialog';
import { CostSimulator } from './cost-simulator';
import { TRIAL_STATUS_LABELS } from '../labels';
import type { ProductOption, RecipeSummaryRow, VersionDetail, VersionListItem } from '../queries';

export function RecipeWorkspace({
  projectId, recipesWithVersions, productOptions, uomOptions, canManage, canRelease,
}: {
  projectId: string;
  recipesWithVersions: Array<{ recipe: RecipeSummaryRow; versions: VersionListItem[] }>;
  productOptions: ProductOption[];
  uomOptions: Array<{ id: string; code: string; name: string }>;
  canManage: boolean;
  canRelease: boolean;
}) {
  const router = useRouter();
  const [selectedRecipeId, setSelectedRecipeId] = useState(recipesWithVersions[0]?.recipe.id ?? null);
  const selectedGroup = recipesWithVersions.find((r) => r.recipe.id === selectedRecipeId) ?? recipesWithVersions[0] ?? null;
  const [selectedVersionId, setSelectedVersionId] = useState(selectedGroup?.recipe.currentVersionId ?? selectedGroup?.versions[0]?.id ?? null);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!selectedVersionId) { setDetail(null); return; }
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
      <div className="space-y-3">
        {recipesWithVersions.length > 1 ? (
          <div className="space-y-1">
            {recipesWithVersions.map((g) => (
              <button
                key={g.recipe.id}
                type="button"
                onClick={() => { setSelectedRecipeId(g.recipe.id); setSelectedVersionId(g.recipe.currentVersionId ?? g.versions[0]?.id ?? null); }}
                className={cn('w-full rounded-md px-2.5 py-1.5 text-left text-[13px]', g.recipe.id === selectedRecipeId ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted')}
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
                className={cn('flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px]', v.id === selectedVersionId ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60')}
              >
                <span>v{v.version}</span>
                <StatusBadge status={v.status} label={status.label} tone={status.tone} size="sm" />
              </button>
            );
          })}
        </div>

        {canManage && selectedGroup ? (
          <Button variant="outline" size="sm" className="w-full" onClick={newVersion} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />} Yeni versiyon
          </Button>
        ) : null}
      </div>

      <div className="min-w-0 rounded-xl border border-border/60 bg-card p-4">
        {loading || !detail ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Yükleniyor…
          </div>
        ) : (
          <CostSimulator detail={detail} projectId={projectId} productOptions={productOptions} uomOptions={uomOptions} canManage={canManage} canRelease={canRelease} />
        )}
      </div>
    </div>
  );
}
