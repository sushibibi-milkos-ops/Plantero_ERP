/**
 * Deterministik sözde-rasgele üretici: sandbox veri üretimi aynı girdiyle her zaman
 * aynı sonucu vermeli (idempotent). Kriptografik değildir, yalnızca demo/sandbox verisi içindir.
 */

/** djb2 dizi karması → 32-bit tohum */
export function hashSeed(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

/** mulberry32: hızlı, deterministik 32-bit PRNG → [0,1) üretir */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bir metin tohumundan deterministik [0,1) üretici döner */
export function seededRandom(seed: string): () => number {
  return mulberry32(hashSeed(seed));
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfUtcDay(d: Date): Date {
  const r = new Date(d);
  r.setUTCHours(0, 0, 0, 0);
  return r;
}
