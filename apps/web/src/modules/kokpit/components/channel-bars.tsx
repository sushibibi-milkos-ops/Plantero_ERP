import { formatMoney } from '@/lib/format';

/**
 * "Bugünkü kanal satışları" çubukları — tek ölçü (net ciro) kanal bazında sıralanmış yatay çubuklar.
 * Kanal kimliği zaten satır etiketinde taşındığı için (bkz. dataviz skill "form heuristic": tek
 * serili sıralama grafiği kimlik ayrımı için kategorik renk GEREKTİRMEZ) çubuklar TEK bir nötr vurgu
 * rengiyle çizilir; en yüksek çubuk birincil renk, diğerleri aynı ailenin soluk tonu.
 *
 * Düz CSS/flex (recharts DEĞİL) — `ResponsiveContainer`'ın ilk ölçüm turu (ResizeObserver) dar/mobil
 * görünümde bazen 0 genişlikte boyandığı bir kare yakalanıyordu (grafik alanı boş, yalnızca eksen
 * etiketi görünüyordu); bu sayfadaki "Satış hunisi" da zaten aynı düz-çubuk deseniyle çizilir —
 * tek ölçülü sıralama çubukları için kütüphaneye hiç gerek yok, disposisyon senkron ve garantili.
 */
export function ChannelBars({ rows }: { rows: { name: string; net: number }[] }) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => b.net - a.net).slice(0, 7);
  const max = Math.max(...sorted.map((r) => r.net), 1);

  return (
    <ul className="space-y-2.5">
      {sorted.map((r, i) => (
        <li key={r.name} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{r.name}</span>
          <div className="h-5 flex-1 overflow-hidden rounded-md bg-muted">
            <div
              className={i === 0 ? 'h-full rounded-md bg-primary' : 'h-full rounded-md bg-[var(--chart-2)] opacity-55'}
              style={{ width: `${Math.max(2, (r.net / max) * 100)}%` }}
            />
          </div>
          <span className="num w-24 shrink-0 text-right text-xs tabular-nums">{formatMoney(r.net, 'TRY', { digits: 0 })}</span>
        </li>
      ))}
    </ul>
  );
}
