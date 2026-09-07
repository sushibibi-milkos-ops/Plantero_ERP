/** Tur 10 (bakim turu) — ortak bileşen kaynaklı bulguyu shell puan kartına yazar (DESIGN-SCORECARD kural 5). */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'artifacts/critic/shell.json';
const card = JSON.parse(readFileSync(PATH, 'utf8'));
const KEY = 'DataTable mobil kart — satır aksiyonu oluğu (rowActions kullanan tüm listeler, 390px)';

const finding = {
  id: 'shell-mobile-card-action-gutter-01',
  criterion: 5,
  severity: 'P2',
  text:
    'Mobil kartın 1. satırı (başlık | rozet(ler) | aksiyon menüsü) aksiyon sütunu için sabit bir oluk ayırmıyor: `rowActions` YALNIZCA bazı satırlar için eylem döndürdüğünde (ör. /bakim/is-emirleri — yalnızca açık iş emrinde menü var) aynı listedeki kartların rozet sağ kenarı iki farklı x\'e düşüyor, rozet sütunu tırtıklı görünüyor.',
  measure:
    'scripts/probe-bakim-r10b.ts (/bakim/is-emirleri @390x844): 6 kartın rozet sağ kenarları [313, 363, 363, 363, 363, 363]; aksiyon menüsü yalnızca 1. kartta (btnRight 363). Fark 50px. Karşılaştırma: /bakim/planlar\'da 12/12 kartta menü var → rozet kenarları eşit.',
  target:
    'Aynı listedeki tüm kartlarda rozet sütununun sağ kenarı eşit olsun (fark ≤ 1px): `rowActions` prop\'u verilmiş bir tabloda menü döndürmeyen satırlarda da aksiyon oluğu yer tutucu olarak korunur (ör. `actions.length ? <DataTableRowActions…/> : <span className="size-8 shrink-0" aria-hidden />`), ya da hiçbir satırda menü yoksa oluk tamamen kaldırılır.',
  file: 'apps/web/src/components/data-table/mobile-cards.tsx (satır 1 flex bloğu — `{actions.length ? <DataTableRowActions … /> : null}`)',
  openedRound: 10,
  foundVia: 'bakim turu 10 (/bakim/is-emirleri)',
};

card.routes[KEY] = { round: 10, reference: 'linear', open: [finding], closed: [] };
card.round = Math.max(card.round ?? 0, 25);
card.note = `${card.note ?? ''}\nTur 10 (bakim): shell-mobile-card-action-gutter-01 açıldı — DataTable mobil kartında koşullu satır aksiyonu rozet sütununu 50px kaydırıyor (/bakim/is-emirleri, 6 kartın 1\'inde menü var). Modül kartlarında tekrar açılmadı.`;
writeFileSync(PATH, JSON.stringify(card, null, 2) + '\n');
console.log('yazıldı:', PATH, '→', KEY);
