/** Tur 5 (bakım turu) — shell puan kartına ortak bileşen bulgusu ekle. */
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'artifacts/critic/shell.json';
const card = JSON.parse(readFileSync(path, 'utf8')) as any;
const key = 'DataTable mobil kart alt başlık satırı — kırpma ellipsis\'siz (DataTable kullanan tüm listeler, 390px)';
if (!card.routes[key]) {
  card.routes[key] = {
    open: [
      {
        id: 'shell-mobile-card-subtitle-ellipsis-01',
        criterion: 5,
        severity: 'P2',
        text: '[bakım Tur 5 tespiti — ortak bileşen] Mobil kart alt başlık satırındaki `overflow-hidden text-ellipsis whitespace-nowrap` span\'ının içeriği blok seviyesinde bir `<div>` — `text-overflow: ellipsis` blok çocuğa uygulanmaz, uzun metin "…" olmadan sert kesiliyor.',
        measure: '/bakim/makineler @390x844, MK-015 satırı: span.min-w-0.shrink.overflow-hidden.text-ellipsis scrollWidth 369 / clientWidth 320 (49px kırpma), textOverflow="ellipsis" ama görünen metin "…Beta-Pak dolum ve k" — üç nokta yok (scripts/probe-bakim-r5f.ts; artifacts/screens/bakim-makineler/mobile.png).',
        target: 'kırpılan alt başlıkta görünür "…" olsun — `truncate`/ellipsis kuralı doğrudan metni taşıyan elemana uygulansın (blok sarmalayıcı kaldırılsın ya da ona da `truncate` verilsin)',
        file: 'apps/web/src/components/data-table/mobile-cards.tsx:287 (`mobile-card-subtitle-row`)',
        openedRound: 5,
      },
    ],
    closed: [],
  };
  card.note = (card.note ?? '') + ' | Tur 5 (bakım): DataTable mobil kart alt başlığında ellipsis\'siz kırpma bulgusu eklendi (P2).';
  writeFileSync(path, JSON.stringify(card, null, 1) + '\n');
  console.log('shell.json güncellendi');
} else console.log('zaten var');
