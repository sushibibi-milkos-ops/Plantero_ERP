'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { getStatusInfo } from '@/lib/status';

const DOT: Record<string, string> = {
  quarantine: 'bg-warning',
  rejected: 'bg-destructive',
  recalled: 'bg-destructive',
  expired: 'bg-destructive',
};
// `released` (lotların ezici çoğunluğu — ör. 200'de 195) ve `consumed` kasıtlı olarak DOT'ta yok:
// aynı bilgiyi hem sütun rozeti (lots-table.tsx) hem de bu nokta iki kez anlatıyordu ve tek istisna
// olması gereken renk her satırda tekrarlanınca karantina/red gibi gerçek istisnalar boğuluyordu.
// Nokta yalnızca "dikkat gerektiren" durumlarda görünür.

/**
 * Lot rozeti: mono lot no + durum noktası. `id` verilirse lot detayına bağlanır.
 * PL-260902-H1-01 gibi kodlar için tasarlandı; tedarikçi lotları da aynı biçimde.
 */
export function LotBadge({
  lotNo,
  status,
  id,
  href,
  className,
}: {
  lotNo: string | null | undefined;
  status?: string | null;
  id?: string;
  href?: string;
  className?: string;
}) {
  if (!lotNo) return <span className="text-xs text-muted-foreground">—</span>;
  const info = status ? getStatusInfo(status, 'lot') : null;
  const to = href ?? (id ? `/depo/lotlar/${id}` : undefined);
  const inner = (
    <span
      title={info ? `${lotNo} · ${info.label}` : lotNo}
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-1.5 font-mono text-[11px] tracking-tight whitespace-nowrap',
        // Tıklanabilir lot rozetleri /depo/skt ve /depo/lotlar mobil listelerinde dokunma hedefi
        // olarak kullanılıyordu (h-5 = 20px, 44px eşiğinin çok altında). Yalnızca bir bağlantıya
        // sarıldığında (to) ve yalnızca mobilde büyütülür — masaüstü yoğunluğu değişmez.
        to && ['hover:border-border hover:bg-muted', 'h-11 px-3 md:h-5 md:px-1.5'],
        className,
      )}
    >
      {status && DOT[status] ? <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT[status])} /> : null}
      {lotNo}
    </span>
  );
  return to ? (
    <Link href={to} className="inline-flex" onClick={(e) => e.stopPropagation()}>
      {inner}
    </Link>
  ) : (
    inner
  );
}
