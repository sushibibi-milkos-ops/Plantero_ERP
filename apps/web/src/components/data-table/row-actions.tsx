'use client';

import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { RowAction } from './types';

/** Satır sonu "…" menüsü. Tıklama satır tıklamasını tetiklemez. */
export function DataTableRowActions<T>({ row, actions }: { row: T; actions: RowAction<T>[] }) {
  if (!actions.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className={[
            'text-muted-foreground data-[state=open]:bg-muted',
            // Dokunma hedefi: mobil kartlarda (el terminali/eldivenli operatör) 24px yetersizdi (44px
            // eşiğinin altında) — mobilde 44px, masaüstünde yoğunluk için 24px korunur.
            'size-11 md:size-6',
            // Tur 12 P1 (shell-mobile-card-actions-height-01): bu buton mobil karttaki "satır 1"
            // flex satırında (items-center) TEK diğer öğe metin başlığıydı (leading-5=20px) — 44px'lik
            // sabit kutu items-center hesaplamasında satırın çapraz-eksen yüksekliğini 44px'e zorluyor,
            // rowActions olan tablolarda (/depo/skt) kart 87.5px'e çıkıyordu (rowActions'sız tablolarda
            // aynı kalıp 68.5px). `getBoundingClientRect` (dokunma hedefi ölçümü) elemanın KENDİ
            // border-box'ını okur, margin'den etkilenmez — bu yüzden kutunun kendisini 44px'te
            // TUTUP yalnızca negatif dikey margin ile ebeveyn flex satırına olan katkısını (margin
            // kutusu = border-box + margin) metin satırının yüksekliğine (20px) indiriyoruz: dokunma
            // hedefi ölçümü hâlâ 44x44 döner, ama satır 1'in çapraz-eksen boyutu artık metin belirler.
            '-my-3 md:my-0',
            // Linear satır aksiyonları yalnızca hover/focus'ta belirir; sürekli görünür "…" 50 satırda
            // gürültüydü. `group/row` yalnızca masaüstü <tr>'de var — mobil kartlarda (ve dokunmatik
            // ekranlarda, hover kavramı olmadığından) her zaman görünür kalır.
            'opacity-100 transition-opacity duration-150 data-[state=open]:opacity-100 md:opacity-0 md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100 md:focus-visible:opacity-100 md:[@media(hover:none)]:opacity-100',
          ].join(' ')}
          aria-label="Satır eylemleri"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40" onClick={(e) => e.stopPropagation()}>
        {actions.map((a, i) => {
          const item = a.href ? (
            <DropdownMenuItem key={i} asChild disabled={a.disabled} variant={a.destructive ? 'destructive' : 'default'}>
              <Link href={a.href}>
                {a.icon ? <a.icon className="size-4" /> : null}
                {a.label}
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={i}
              disabled={a.disabled}
              variant={a.destructive ? 'destructive' : 'default'}
              onSelect={() => a.onSelect?.(row)}
            >
              {a.icon ? <a.icon className="size-4" /> : null}
              {a.label}
            </DropdownMenuItem>
          );
          return a.separatorBefore ? (
            <div key={`sep-${i}`}>
              <DropdownMenuSeparator />
              {item}
            </div>
          ) : (
            item
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
