import { cn } from '@/lib/utils';

/**
 * Sayfa başlığı: başlık + açıklama solda, eylemler sağda.
 * Mobilde eylemler alt satıra iner ve tam genişlik alır.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Başlığın üstünde küçük etiket (örn. belge no) */
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** Başlık altına ek şerit (sekmeler, filtreler) */
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('mb-5 md:mb-7', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <div className="mb-0.5 text-[13px] font-medium text-muted-foreground">{eyebrow}</div> : null}
          {/* iOS Large Title: 28px (mobil) / 32px (masaüstü), 700, -0.4px tracking (globals.css `large-title`) */}
          <h1 className="large-title line-clamp-2 break-words md:line-clamp-none md:truncate">{title}</h1>
          {/* <p> DEĞİL: yükleniyor iskeletleri description'a <Skeleton/> (bir <div>) geçiriyor —
              <div>, <p> içinde geçersiz HTML + hydration hatası üretiyordu (Tur 10 P1). Tipografi
              aynı kalır, yalnızca sarmalayıcı etiket değişti. */}
          {description ? <div className="mt-1 text-[15px] text-muted-foreground">{description}</div> : null}
        </div>
        {/* Kök neden (P1 shell-pageheader-actions-badge-01, kriter 9): `[&>*]:flex-1` actions'ın
            DOĞRUDAN her çocuğuna uygulanıyordu — bir buton/link tek eylemse mobilde tam genişlik
            (dokunması kolay birincil CTA) istenir, ama actions tek başına bir <StatusBadge/> (rozet)
            taşıdığında (ör. /arge/projeler/[id]/board) aynı kural rozeti 358px'e geriyordu; rozet
            kendi içerik genişliğini korumalı. Yalnızca gerçek interaktif kökler (button/a — Button/
            Button asChild+Link/Dialog+Trigger'ların gerçek DOM köküdür) flex-1 alır; rozet, span
            sarmalayıcı (Tooltip), veya çok-butonlu bir <div> sarmalayıcı (DeliveryActions vb.) kendi
            doğal genişliğinde kalır — bu sarmalayıcılar zaten kendi içindeki butonları tek tek
            stretch etmiyordu, bu yüzden görsel olarak değişmez. */}
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 [&>a]:flex-1 [&>button]:flex-1 sm:[&>a]:flex-none sm:[&>button]:flex-none">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
