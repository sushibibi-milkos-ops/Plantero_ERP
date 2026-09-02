/**
 * EAN-13 checksum doğrulaması — istemci tarafı (barkod alanına canlı geri bildirim için).
 * Sunucu tarafındaki gerçek doğrulama `@plantero/core` (`isValidEan13`) ile aynı algoritmadır;
 * bu dosya yalnızca istemci bileşenlerinin sunucu-only paketleri (db bağlantısı) içe aktarmaması içindir.
 */
export function isValidEan13(code: string | null | undefined): boolean {
  if (!code) return false;
  const s = code.trim();
  if (!/^\d{13}$/.test(s)) return false;
  const digits = s.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const computed = (10 - (sum % 10)) % 10;
  return computed === check;
}
