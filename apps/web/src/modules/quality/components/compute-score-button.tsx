'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Calculator, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { computeSupplierScoresAction } from '../actions';

// Tur 1 P1 kalite-tedarikci-01: ham `<input type="month">` tarayıcının kendi yerel denetimiydi — ay adı
// sayfa diline değil TARAYICI arayüz diline bağlı olduğundan tr-TR bağlamda bile "September 2026"
// basıyor, üstüne tarayıcının kendi takvim ikonu geliyordu (uygulamanın Türkçe UI kuralının tek ihlali,
// aynı zamanda ekrandaki tek "varsayılan HTML görünümü" öğesiydi). Kendi Ay/Yıl Select'imiz Türkçe ay
// adlarını her zaman gösterir, tarayıcı yerelinden bağımsız.
//
// Tur 2 P1 kalite-tedarikci-04: düz `h-11 ... md:h-9` shadcn SelectTrigger tabanındaki
// `data-[size=default]:h-9` (özgüllük 0,2,1) tarafından her viewport'ta eziliyordu (0,1,0) — mobilde
// de masaüstünde de 36px kalıyordu. `data-[size=default]:...` önekiyle aynı özgüllükte yazıp override
// ediyoruz: mobilde 44px, `md:` ile masaüstünde 36px.
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function currentPeriod(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function ComputeScoreButton() {
  const initial = currentPeriod();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const period = `${year}-${String(month).padStart(2, '0')}`;
  // Son 4 yıl — tedarikçi skoru geçmişe dönük hesaplanır, gelecek dönem seçilmesine gerek yok.
  const years = Array.from({ length: 4 }, (_, i) => initial.year - i);

  function run() {
    startTransition(async () => {
      const res = await computeSupplierScoresAction({ period });
      if (res.ok) { toast.success(`${res.data.count} tedarikçi için ${MONTHS[month - 1]} ${year} skoru hesaplandı`); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    // kalite-tedarikci-05 (tur 3, P1, kriter 2): `flex-wrap` yoktu — 390px'te 112 (w-28) + 96 (w-24)
    // + 2×8 gap + 145 (buton) = 369px, sayfa oluğu (374px) az taşıyor, tek hizasız öğe. Artık mobilde
    // sarıyor (select'ler ilk satırda, buton `w-full` ile ikinci satırda), masaüstünde `sm:` ile eski
    // tek satır düzeni korunuyor.
    <div className="flex flex-wrap items-center gap-2">
      <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
        <SelectTrigger className="w-28 text-[13px] data-[size=default]:h-11 md:data-[size=default]:h-9" aria-label="Ay"><SelectValue /></SelectTrigger>
        <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
        <SelectTrigger className="w-24 text-[13px] data-[size=default]:h-11 md:data-[size=default]:h-9" aria-label="Yıl"><SelectValue /></SelectTrigger>
        <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
      </Select>
      <Button onClick={run} disabled={pending} className="w-full sm:w-auto">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />} Skoru Hesapla
      </Button>
    </div>
  );
}
