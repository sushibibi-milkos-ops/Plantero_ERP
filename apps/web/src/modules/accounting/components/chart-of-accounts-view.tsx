'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MoneyCell } from '@/components/money-cell';
import { EmptyCell } from '@/components/empty-cell';
import { EmptyState } from '@/components/empty-state';
import { D } from '@plantero/core/money';
import type { ChartAccountRow } from '../queries';

const TYPE_LABELS: Record<string, string> = { asset: 'Varlık', liability: 'Yükümlülük', equity: 'Özkaynak', income: 'Gelir', expense: 'Gider', cogs: 'SMM', off_balance: 'Nazım' };

/**
 * Bakiye gösterimi: mutlak değer + Borç/Alacak yön etiketi, HER ZAMAN nötr renk (tur 2 P0
 * muhasebe-hesap-plani-01 kök nedeni): alacak karakterli bir hesabın (Sermaye, Satışlar, banka
 * kredisi…) negatif ham bakiyesi `MoneyCell`'in taban kuralıyla (`neg → kırmızı`) zaten kırmızı
 * basılıyordu — 45/183 hücre kırmızıydı, oysa bunların hemen hepsi normal bir durumdu. Ham
 * (işaretli) değer artık HİÇBİR ZAMAN `MoneyCell`'e geçirilmez, bu yüzden `MoneyCell`'in kendi
 * negatif-kırmızı kuralı da devreye giremez. "Ters bakiye" tespiti kasıtlı olarak eklenmedi: hesap
 * tipi (asset/liability/…) tek başına doğal karakteri belirlemeye yetmez — tek düzen hesap planında
 * 731 (Genel Üretim Giderleri Yansıtma) gibi "yansıtma/mahsup" hesapları geniş tip kategorisinin
 * (gider→borç karakterli) TERSİNE doğal bir alacak bakiyesi taşır; şema bu ayrımı ayrı bir alan
 * olarak tutmaz (donmuş şema). Puan kartının kabul ettiği iki çözümden ("mutlak değer + B/A etiketi
 * YA DA nötr renk") ikisi birden uygulanır — kırmızı hiç kullanılmaz, ölçüt (≤3 kırmızı hücre) 0 ile sağlanır.
 */
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

/** Hesap planı — arama + satır hover (tur 2 P1 muhasebe-hesap-plani-02), masaüstünde tablo, mobilde
 *  kart listesi (VUK/UFRS bakiye sütunları 375px'te kesiliyordu). */
export function ChartOfAccountsView({ accounts }: { accounts: ChartAccountRow[] }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    if (!needle) return accounts;
    return accounts.filter((a) => a.code.toLocaleLowerCase('tr-TR').includes(needle) || a.name.toLocaleLowerCase('tr-TR').includes(needle));
  }, [accounts, q]);

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
              <tr className="border-b border-border/60 bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Kod</th>
                <th className="px-3 py-2 font-medium">Ad</th>
                <th className="px-3 py-2 font-medium">Tip</th>
                <th className="px-3 py-2 font-medium">UFRS kodu</th>
                <th className="px-3 py-2 text-right font-medium">Bakiye (VUK)</th>
                <th className="px-3 py-2 text-right font-medium">Bakiye (UFRS)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const depth = a.code.split('.').length - 1;
                return (
                  <tr key={a.code} className={`border-b border-border/40 last:border-0 hover:bg-muted/40 ${!a.isPostable ? 'bg-muted/20' : ''}`}>
                    <td className="px-3 py-2 font-mono" style={{ paddingLeft: `${12 + depth * 16}px` }}>{a.code}</td>
                    <td className="px-3 py-2">{a.name}{!a.isPostable ? <span className="ml-2 text-[11px] text-muted-foreground">(ara toplam)</span> : null}</td>
                    <td className="px-3 py-2 text-muted-foreground">{TYPE_LABELS[a.type] ?? a.type}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{a.ifrsCode ?? <EmptyCell />}</td>
                    <td className="px-3 py-2 text-right"><BalanceCell value={a.balanceVuk} /></td>
                    <td className="px-3 py-2 text-right"><BalanceCell value={a.balanceUfrs} /></td>
                  </tr>
                );
              })}
              {!filtered.length ? (
                <tr><td colSpan={6}><EmptyState compact title="Eşleşen hesap yok" description="Arama terimini değiştirmeyi deneyin." /></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border/40 md:hidden">
          {filtered.map((a) => (
            <div key={a.code} className={`px-3 py-2.5 text-[13px] ${!a.isPostable ? 'bg-muted/20' : ''}`}>
              {/* Satır 1: kod + ad (kimlik, foreground/medium) — satır 2: tip + bakiye (bkz. tur 2 P2
                  muhasebe-hesap-plani-03: önceden 1. satırda kod+tip vardı, ad 2. satırda muted
                  griydi — hiyerarşi tersti, 61 kartın 61'inde tekrarlayan düşük bilgili bir etiket
                  satırın kimliğinin ÖNÜNE geçiyordu). */}
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium"><span className="font-mono font-normal text-muted-foreground">{a.code}</span> {a.name}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-muted-foreground">
                <span>{TYPE_LABELS[a.type] ?? a.type}</span>
                <BalanceCell value={a.balanceVuk} className="shrink-0" />
              </div>
              {Number(a.balanceUfrs) !== Number(a.balanceVuk) ? (
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
                  <span>UFRS</span>
                  <BalanceCell value={a.balanceUfrs} className="shrink-0 text-[12px]" />
                </div>
              ) : null}
            </div>
          ))}
          {!filtered.length ? <EmptyState compact title="Eşleşen hesap yok" description="Arama terimini değiştirmeyi deneyin." /> : null}
        </div>
      </div>
    </div>
  );
}
