import type { RowData } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import type { StatusTone } from '@/lib/status';

/** Sütun meta genişletmesi: hizalama, mobil rol, genişlik */
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: 'left' | 'right' | 'center';
    /** Hücre sınıfı */
    className?: string;
    headerClassName?: string;
    /** Mobil kart görünümündeki rol: başlık, alt başlık, satır (varsayılan), etiketsiz tek satır meta ya da gizli */
    mobile?: 'title' | 'subtitle' | 'row' | 'hidden' | 'badge' | 'meta';
    /** Mobil kartta etiket (başlık string değilse) */
    label?: string;
    /** Sabit genişlik (px ya da CSS) */
    width?: number | string;
    /** Sıralanamaz */
    noSort?: boolean;
    /** Masaüstünde başlangıçta gizli (sütun seçiciden açılabilir) — dar ekranlarda taşan az kullanılan sütunlar için */
    defaultHidden?: boolean;
    /** Sağa sabitlenen sütun (ör. "Genel toplam") — yalnızca tablo GERÇEKTEN yatay taşarken
     *  `sticky right-0 bg-card` uygulanır (bkz. data-table.tsx `scrollable` ölçümü); taşmayan
     *  tabloda sabit konumlama ve opak zemin YOK, böylece başlıkta/satırda kaza eseri gri
     *  dikdörtgen kalmaz. Sütun tanımı bg/position sınıfını kendi className'inde TEKRARLAMAMALI. */
    pinRight?: boolean;
  }
}

export type FilterOption = { value: string; label: string; tone?: StatusTone; icon?: LucideIcon };

export type DataTableFilter = {
  columnId: string;
  title: string;
  options: FilterOption[];
};

export type RowAction<T> = {
  label: string;
  icon?: LucideIcon;
  onSelect?: (row: T) => void;
  href?: string;
  destructive?: boolean;
  disabled?: boolean;
  /** Ayraçtan sonra */
  separatorBefore?: boolean;
};
