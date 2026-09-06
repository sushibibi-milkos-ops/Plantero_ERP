'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '@/lib/format';

/**
 * "Bugünkü kanal satışları" çubukları — tek ölçü (net ciro) kanal bazında sıralanmış yatay çubuklar.
 * Kanal kimliği zaten Y ekseni etiketinde taşındığı için (bkz. dataviz skill "form heuristic":
 * tek serili sıralama grafiği) çubuklar TEK bir nötr vurgu rengiyle çizilir — kategorik bir palet
 * (ör. /satis/net-ciro'daki zaman serisi kanal renkleri) burada kimlik ayrımı için gerekli değildir,
 * gereksiz renk kategorik-olmayan bir grafikte "her şey ayrı bir şeymiş" izlenimi verir.
 * En yüksek çubuk hafifçe vurgulanır (birincil renk); diğerleri aynı ailenin soluk tonu.
 */
export function ChannelBars({ rows }: { rows: { name: string; net: number }[] }) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => b.net - a.net).slice(0, 7);
  const max = Math.max(...sorted.map((r) => r.net), 1);

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, sorted.length * 32)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide domain={[0, max * 1.08]} />
        <YAxis
          type="category"
          dataKey="name"
          width={92}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]!;
            return (
              <div className="rounded-lg border border-border/70 bg-popover px-2.5 py-1.5 text-xs shadow-md">
                <div className="font-medium">{p.payload.name}</div>
                <div className="num tabular-nums text-muted-foreground">{formatMoney(p.value as number, 'TRY', { digits: 0 })}</div>
              </div>
            );
          }}
        />
        <Bar dataKey="net" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {sorted.map((r, i) => (
            <Cell key={r.name} fill={i === 0 ? 'var(--primary)' : 'var(--chart-2)'} fillOpacity={i === 0 ? 1 : 0.55} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
