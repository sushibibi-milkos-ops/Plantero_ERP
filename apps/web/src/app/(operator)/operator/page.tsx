import type { Metadata } from 'next';
import { Play, ScanBarcode, PackagePlus } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';

export const metadata: Metadata = { title: 'Operatör' };

/** Yer tutucu: üretim modülü iş emri seçimi ve barkod akışını buraya bağlar. */
export default function OperatorHome() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vardiya paneli</h1>
        <p className="text-muted-foreground">Bir iş emri seçin veya barkod okutun.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Play, label: 'İş emri başlat' },
          { icon: ScanBarcode, label: 'Lot okut' },
          { icon: PackagePlus, label: 'Çıktı kaydet' },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            disabled
            className="flex h-28 flex-col items-center justify-center gap-2 rounded-xl border bg-card text-base font-medium shadow-xs disabled:opacity-60"
          >
            <b.icon className="size-7 text-primary" />
            {b.label}
          </button>
        ))}
      </div>
      <EmptyState
        icon={Play}
        title="Atanmış iş emri yok"
        description="Üretim modülü yayınlandığında hattınıza atanan iş emirleri burada listelenecek."
        compact
      />
    </div>
  );
}
