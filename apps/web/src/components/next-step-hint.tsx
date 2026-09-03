/**
 * Az kayıtlı liste ekranlarının (tek satırlık sayım, birkaç satırlık transfer/mal kabul…) tablo
 * altında viewport'un geri kalanını boş bıraktığı durum için düşük vurgulu bir "sıradaki adım"
 * satırı — sayfa "yarım kalmış" görünmesin diye (Tur 4 P2 bulgusu). Sayfa zaten TÜM kayıtları
 * listelediğinden bir "tümünü gör" bağlantısı taşımaz, yalnızca bağlamsal bir ipucu verir.
 */
export function NextStepHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-center text-[13px] text-muted-foreground/80">{children}</p>;
}
