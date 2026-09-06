/**
 * Önce/sonra JSON farkı — Linear tarzı sade diff: değişmeyen alanlar soluk, değişen alanlar
 * vurgulu (eski değer üstü çizili kırmızı, yeni değer yeşil). Yalnızca en üst düzey alanlar
 * karşılaştırılır (audit satırları zaten kayıt bazlı, iç içe obje/aralarındaki fark JSON olarak
 * gösterilir — okunabilirlik/karmaşıklık dengesi).
 */

type Json = Record<string, unknown> | null | undefined;

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v, null, 2);
}

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function AuditDiff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before ?? {}) as Json;
  const a = (after ?? {}) as Json;

  if (!before && !after) {
    return <p className="text-[12px] text-muted-foreground">Bu kayıt için önce/sonra verisi tutulmadı.</p>;
  }

  const keys = Array.from(new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])).sort();
  if (keys.length === 0) {
    return <p className="text-[12px] text-muted-foreground">Boş obje.</p>;
  }

  return (
    <div className="divide-y divide-border/50 rounded-md border border-border/60">
      {keys.map((k) => {
        const bv = b?.[k];
        const av = a?.[k];
        const changed = !eq(bv, av);
        const onlyAfter = !(b && k in b);
        const onlyBefore = !(a && k in a);
        return (
          <div key={k} className={changed ? 'bg-warning/5 px-3 py-2' : 'px-3 py-2'}>
            <div className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{k}</div>
            {!changed ? (
              <div className="code text-[12px] break-all text-foreground/80">{fmtVal(av ?? bv)}</div>
            ) : (
              <div className="flex flex-col gap-1 text-[12px]">
                {!onlyAfter ? (
                  <div className="code flex items-start gap-1.5 break-all text-destructive line-through decoration-destructive/50">
                    <span className="shrink-0 font-sans text-[10px] font-semibold no-underline">ÖNCE</span>
                    {fmtVal(bv)}
                  </div>
                ) : null}
                {!onlyBefore ? (
                  <div className="code flex items-start gap-1.5 break-all text-success">
                    <span className="shrink-0 font-sans text-[10px] font-semibold">SONRA</span>
                    {fmtVal(av)}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
