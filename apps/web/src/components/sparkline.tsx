import { cn } from '@/lib/utils';

/**
 * Küçük çizgi grafik (inline SVG). Kütüphane yok; KPI kartlarında ve tablo hücrelerinde.
 * Alan dolgusu hafif, son nokta vurgulu.
 */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  tone = 'primary',
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  tone?: 'primary' | 'success' | 'danger' | 'muted' | 'info';
  className?: string;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => [pad + i * stepX, pad + (height - pad * 2) * (1 - (v - min) / span)] as const);
  const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${path} L${pts[pts.length - 1]![0].toFixed(1)},${height} L${pts[0]![0].toFixed(1)},${height} Z`;
  const last = pts[pts.length - 1]!;
  const color = {
    primary: 'var(--primary)',
    success: 'var(--success)',
    danger: 'var(--destructive)',
    muted: 'var(--muted-foreground)',
    info: 'var(--info)',
  }[tone];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('shrink-0 overflow-visible', className)}
      aria-hidden
      style={{ color }}
    >
      <path d={area} fill="currentColor" opacity={0.1} />
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2} fill="currentColor" />
    </svg>
  );
}
