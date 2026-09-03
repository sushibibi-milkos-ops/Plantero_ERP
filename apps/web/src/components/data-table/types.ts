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
    /** Bu sütun kalan (artan) genişliği alır — Tur 10 P1 shell-datatable-slack-01 kök neden düzeltmesi:
     *  `width` verilmemiş sütunlar HTML'in auto table-layout'unda kalan genişliği paylaşır; az sütunlu
     *  tablolarda (ör. 2-3 sütun) bu, hiçbir gerçek bilgi taşımayan tek bir sütunun tablonun üçte
     *  birini kaplamasına yol açar. Bir sütun `flex:true` ile işaretlenince — yalnızca O TABLODA —
     *  `width` VERİLMEMİŞ diğer tüm sütunlar `width:1%` (içeriğe sıkışma) ipucu alır, kalan genişlik
     *  yalnızca flex sütununa akar (genelde ad/açıklama gibi doğal olarak büyümesi istenen sütun).
     *  Hiçbir sütun `flex` işaretlenmemişse tablo ESKİ davranışını aynen korur (geriye dönük uyumlu,
     *  var olan hiçbir tabloyu etkilemez) — yeni tablolar/kolonlar bunu bilinçli olarak açar. */
    flex?: boolean;
    /** Sıralanamaz */
    noSort?: boolean;
    /** Masaüstünde başlangıçta gizli (sütun seçiciden açılabilir) — dar ekranlarda taşan az kullanılan sütunlar için */
    defaultHidden?: boolean;
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
