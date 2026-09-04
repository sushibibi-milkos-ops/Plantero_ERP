'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MoneyCell } from '@/components/money-cell';
import { EmptyState } from '@/components/empty-state';
import { D } from '@plantero/core/money';
import type { TrialBalanceRow } from '../queries';

/** Bakiye gösterimi: mutlak değer + Borç/Alacak yön etiketi, her zaman nötr renk — gerekçe
 *  chart-of-accounts-view.tsx BalanceCell ile birebir aynı (tur 2 P0 muhasebe-mizan-01, aynı kök
 *  neden hesap planıyla paylaşılır: hesap TİPİ tek başına "ters bakiye" tespiti için yetersiz —
 *  731 gibi yansıtma hesapları geniş kategorinin tersine doğal bakiye taşır, şema bunu ayrı bir
 *  alan olarak tutmaz). */
function BalanceCell({ value, className }: { value: string; className?: string }) {
  const bal = D(value);
  if (bal.isZero()) return <MoneyCell value="0" muted className={className} />;
  return (
    <span className={className}>
      <MoneyCell value={bal.abs().toFixed(4)} />
      <span className="ml-1 text-[11px] text-muted-foreground">{bal.gt(0) ? 'B' : 'A'}</span>
    </span>
  );
}

/** Mizan — arama + satır hover (tur 2 P1 muhasebe-mizan-03), masaüstünde tablo, mobilde kart listesi
 *  (3 para sütunu 375px'te kesiliyordu). */
export function TrialBalanceView({ rows, totalDebit, totalCredit }: { rows: TrialBalanceRow[]; totalDebit: string; totalCredit: string }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    if (!needle) return rows;
    return rows.filter((r) => r.code.toLocaleLowerCase('tr-TR').includes(needle) || r.name.toLocaleLowerCase('tr-TR').includes(needle));
  }, [rows, q]);

  return (
    <div>
      <div className="relative mb-3 w-full sm:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kod, ad ara…" className="h-11 pl-8 text-[13px] md:h-8" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-left text-[12px] text-muted-foreground">
                <th className="px-3 py-2 font-medium">Kod</th>
                <th className="px-3 py-2 font-medium">Hesap</th>
                <th className="px-3 py-2 text-right font-medium">Borç</th>
                <th className="px-3 py-2 text-right font-medium">Alacak</th>
                <th className="px-3 py-2 text-right font-medium">Bakiye</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.code} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2 font-mono">{r.code}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right"><MoneyCell value={r.debit} /></td>
                  <td className="px-3 py-2 text-right"><MoneyCell value={r.credit} /></td>
                  <td className="px-3 py-2 text-right"><BalanceCell value={r.balance} /></td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr><td colSpan={5}><EmptyState compact title="Eşleşen hesap yok" description="Arama terimini değiştirmeyi deneyin." /></td></tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/60 font-medium">
                <td colSpan={2} className="px-3 py-2 text-right">Toplam</td>
                <td className="px-3 py-2 text-right"><MoneyCell value={totalDebit} /></td>
                <td className="px-3 py-2 text-right"><MoneyCell value={totalCredit} /></td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="divide-y divide-border/40 md:hidden">
          {filtered.map((r) => (
            <div key={r.code} className="px-3 py-2.5 text-[13px]">
              <div className="flex items-center justify-between gap-2">
                <span><span className="font-mono">{r.code}</span> <span className="text-muted-foreground">{r.name}</span></span>
                <BalanceCell value={r.balance} className="shrink-0 font-medium" />
              </div>
              <div className="mt-0.5 flex gap-3 text-[12px] text-muted-foreground">
                <span>Borç <MoneyCell value={r.debit} className="text-[12px]" /></span>
                <span>Alacak <MoneyCell value={r.credit} className="text-[12px]" /></span>
              </div>
            </div>
          ))}
          {!filtered.length ? <EmptyState compact title="Eşleşen hesap yok" description="Arama terimini değiştirmeyi deneyin." /> : null}
        </div>
      </div>

      {/* Etiketli mobil toplam (tur 2 P1 muhasebe-mizan-03): önceden iki etiketsiz sayı yan yanaydı
          ("₺8.878.940,33 ₺8.878.940,33") — hangisinin borç hangisinin alacak olduğu belirsizdi. */}
      <div className="mt-2 flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-[13px] font-medium md:hidden">
        <span>Toplam</span>
        <span className="flex gap-3">
          <span className="text-muted-foreground font-normal">Borç <MoneyCell value={totalDebit} /></span>
          <span className="text-muted-foreground font-normal">Alacak <MoneyCell value={totalCredit} /></span>
        </span>
      </div>
    </div>
  );
}
