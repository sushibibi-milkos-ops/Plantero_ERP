/**
 * Az kayıtlı liste ekranlarının (tek satırlık sayım, birkaç satırlık transfer/mal kabul…) tablo
 * altında viewport'un geri kalanını boş bıraktığı durum için düşük vurgulu bir "sıradaki adım"
 * satırı — sayfa "yarım kalmış" görünmesin diye (Tur 4 P2 bulgusu). Sayfa zaten TÜM kayıtları
 * listelediğinden bir "tümünü gör" bağlantısı taşımaz, yalnızca bağlamsal bir ipucu verir.
 *
 * Kök neden (Tur 5 P2): önceki sürüm ortalanmış, tablodan kopuk, tıklanamaz gri bir cümleydi —
 * dolu bir tablonun altında "boş durum başarısız olmuş" izlenimi veriyordu. Artık Linear'ın tablo
 * sonu "add item" satırı kalıbı: sola hizalı, tablonun alt kenarına yapışık bir çizgi (`border-t`),
 * opsiyonel bir eylem tetikleyicisi taşır.
 */
export function NextStepHint({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border/60 px-3 py-2.5 text-left text-[13px] text-muted-foreground">
      <span>{children}</span>
      {action}
    </div>
  );
}
