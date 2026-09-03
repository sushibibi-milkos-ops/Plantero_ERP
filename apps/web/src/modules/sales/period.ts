/** Net ciro ekranı dönem seçici — `?period=bugun|7g|30g|ay|custom&from=&to=`. */

export type PeriodKey = 'bugun' | '7g' | '30g' | 'ay' | 'custom';

const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function resolveRange(period: string | undefined, from?: string, to?: string): { from: string; to: string; period: PeriodKey } {
  const today = toIso(new Date());
  if (period === 'custom' && from && to) return { from, to, period: 'custom' };
  if (period === 'ay') return { from: `${today.slice(0, 7)}-01`, to: today, period: 'ay' };
  if (period === 'bugun') return { from: today, to: today, period: 'bugun' };
  if (period === '7g') return { from: toIso(new Date(Date.now() - 6 * 86_400_000)), to: today, period: '7g' };
  return { from: toIso(new Date(Date.now() - 29 * 86_400_000)), to: today, period: '30g' };
}

export const PERIOD_LABELS: Record<PeriodKey, string> = { bugun: 'Bugün', '7g': '7 gün', '30g': '30 gün', ay: 'Bu ay', custom: 'Özel' };
