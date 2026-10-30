/**
 * Ürün ağacı akış şeması — süreç sabiti ve ikon eşlemesi (JSX'siz, test edilebilir).
 *
 * VARSAYIM: Süreç adları docs/PRODUCTION-LINES.md'deki hat proses adımlarından kullanıcı onayıyla sadeleştirilmiş
 * özetlerdir (makine bazlı değil, operatör diliyle). Tek kaynak `LINE_PROCESSES`; adım değişirse yalnız burası değişir.
 */
import {
  Blend, Boxes, Candy, CircleDot, Coffee, Combine, Droplets, Dumbbell, FlaskConical, Factory, Funnel, GlassWater,
  Layers, Leaf, Milk, Nut, Package, PackageCheck, Pipette, Scale, ShieldCheck, Sparkles, Tag, Thermometer,
  Waves, Wheat, Wine, type LucideIcon,
} from 'lucide-react';
import type { BomNodeKind } from './bom-tree';

/* ------------------------------------------------------------------ */
/* Süreç adımları                                                       */
/* ------------------------------------------------------------------ */

/**
 * `prep` = hazırlık/üretim aşaması (karıştırma, homojenizasyon, tartım…), `fill` = dolum & kapama aşaması,
 * `all` = ayrım yok. Yarı mamul düğümü yalnız `prep` adımlarını, yarı mamul bileşeni olan mamul yalnız
 * `fill` adımlarını gösterir (hazırlık yarı mamulde yapılmıştır); yarı mamulsüz mamul tüm adımları gösterir.
 */
export type ProcessPhase = 'prep' | 'fill' | 'all';
export type ProcessStep = { key: string; label: string; phase: ProcessPhase };

export const LINE_PROCESSES: Record<string, ProcessStep[]> = {
  // Bazlar / barista / kremalar
  HAT1: [
    { key: 'mix', label: 'Karıştırma', phase: 'prep' },
    { key: 'homogenize', label: 'Homojenizasyon', phase: 'prep' },
    { key: 'fill', label: 'Dolum', phase: 'fill' },
    { key: 'cap-label', label: 'Kapama & Etiket', phase: 'fill' },
  ],
  // Toz karıştırma & dolum
  HAT2: [
    { key: 'weigh', label: 'Tartım', phase: 'prep' },
    { key: 'powder-mix', label: 'Toz karıştırma', phase: 'prep' },
    { key: 'fill', label: 'Dolum', phase: 'fill' },
    { key: 'cap-label', label: 'Kapama & Etiket', phase: 'fill' },
  ],
  // Saşe / stick
  HAT3: [
    { key: 'powder-mix', label: 'Toz karıştırma', phase: 'prep' },
    { key: 'sachet-fill', label: 'Saşe/stick dolum', phase: 'fill' },
    { key: 'boxing', label: 'Kutulama', phase: 'fill' },
  ],
};

/** Hat bilgisi yoksa (veya tanımsız hat kodu) genel süreç */
export const GENERIC_PROCESS: ProcessStep[] = [{ key: 'produce', label: 'Üretim', phase: 'all' }];

/**
 * Bir düğümün (reçetesi olan) süreç adımları. `lineCode` düğümün kendi hattı; yoksa üst düğümün hattı kullanılır
 * (çağıran miras alır). `role`: yarı mamul → hazırlık adımları; mamul → yarı mamul bileşeni varsa dolum adımları.
 */
export function stepsFor(lineCode: string | null | undefined, role: 'semi' | 'finished', hasSemiChild: boolean): ProcessStep[] {
  const all = (lineCode ? LINE_PROCESSES[lineCode.toUpperCase()] : undefined) ?? GENERIC_PROCESS;
  const wanted: ProcessPhase | null = role === 'semi' ? 'prep' : hasSemiChild ? 'fill' : null;
  if (!wanted) return all;
  const picked = all.filter((s) => s.phase === wanted || s.phase === 'all');
  return picked.length > 0 ? picked : all;
}

/* ------------------------------------------------------------------ */
/* İkon eşlemesi                                                        */
/* ------------------------------------------------------------------ */

export type IconNodeInput =
  | { kind: 'material'; type: BomNodeKind; name: string }
  | { kind: 'process'; key?: string; label: string };

/** Türkçe karakterleri sadeleştirip küçültür: "Fındık Püresi" → "findik puresi" (yalnızca eşleştirme için). */
export function foldForMatch(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type Rule = { re: RegExp; icon: LucideIcon };

/* Ambalaj kuralları — ambalaj tipinde ve genel olarak adda aranır. Sıra önemli: ilk eşleşen kazanır. */
const PACKAGING_RULES: Rule[] = [
  { re: /emniyet|shrink|tamper|muhur|\bbant/, icon: ShieldCheck },
  { re: /kapak|twist|\bcap\b|\blid\b|tapa/, icon: CircleDot },
  { re: /etiket|label|sticker/, icon: Tag },
  { re: /\bcam\b.*(sise|kavanoz|bottle|jar)|(sise|kavanoz|bottle|jar).*\bcam\b|glass/, icon: Wine },
  { re: /sise|bottle|\bpet\b|kavanoz|\bjar\b|siseler/, icon: Milk },
  { re: /sase|stick|pipet/, icon: Pipette },
  { re: /koli|kutu|\bbox\b|karton|carton|palet|doypack|poset|pouch|torba/, icon: Package },
];

/* Hammadde kuralları. */
const MATERIAL_RULES: Rule[] = [
  { re: /(^|\s)(\w*yag|\w*yagi|oil)(\s|$)/, icon: Droplets },
  { re: /(^|\s)su(\s|$)|\bwater\b|\bmaden suyu/, icon: GlassWater },
  { re: /badem|kaju|findik|fistik|ceviz|antep|kestane|hindistan|pecan|macadamia|\bnuts?\b|almond|cashew|hazelnut|peanut|pistachio|walnut|pure|ezme|tahin|susam|sesame/, icon: Nut },
  { re: /yulaf|\boats?\b|bugday|wheat|\bun\b|flour|tahil|grain|misir|corn|pirinc|rice|arpa|kinoa|quinoa|cavdar|mercimek|nohut/, icon: Wheat },
  { re: /protein|whey|kazein|casein|izolat|isolate|bcaa/, icon: Dumbbell },
  { re: /kahve|coffee/, icon: Coffee },
  { re: /seker|sugar|sweet|tatlandirici|stevia|\bbal\b|honey|hurma|surup|syrup|glukoz|fruktoz|maltodekstrin|eritritol|ksilitol|sukraloz|kakao|cikolata|cocoa|chocolate/, icon: Candy },
  { re: /aroma|flavou?r|vanil|esans|tat verici|extract|ekstrakt/, icon: Sparkles },
  { re: /vitamin|mineral|stabiliz|emulgat|lesitin|lecithin|\bgam\b|guar|ksantan|xanthan|pektin|pectin|karragenan|kalsiyum|calcium|magnezyum|magnesium|sodyum|\btuz\b|salt|katki|additive|enzim|probiyotik|kolajen|collagen|asit|\bacid\b|koruyucu/, icon: FlaskConical },
  { re: /\bsut\b|\bsutu\b|milk|krema|cream/, icon: Milk },
];

/* Süreç kuralları — adım anahtarı VE etiket üzerinde aranır. */
const PROCESS_RULES: Rule[] = [
  { re: /toz karisti|powder/, icon: Combine },
  { re: /karisti|mix|blend/, icon: Blend },
  { re: /homojen|homogen/, icon: Waves },
  { re: /pastor|pasteur|isil|thermo/, icon: Thermometer },
  { re: /sase|stick/, icon: Pipette },
  { re: /dolum|fill/, icon: Funnel },
  { re: /kapama|etiket|cap|label/, icon: Tag },
  { re: /kutu|boxing|box/, icon: Boxes },
  { re: /tartim|weigh/, icon: Scale },
];

function firstMatch(rules: Rule[], folded: string): LucideIcon | null {
  for (const r of rules) if (r.re.test(folded)) return r.icon;
  return null;
}

/**
 * Düğüm için ikon: yarı mamul → Layers, mamul → PackageCheck; ambalaj/hammadde adına göre Türkçe+İngilizce
 * anahtar kelimelerle belirlenir (deterministik, ilk eşleşen); süreç adımları anahtar/etiketinden. Eşleşme yoksa
 * ambalaj → Package, hammadde → Leaf, süreç → Factory.
 */
export function iconForNode(input: IconNodeInput): LucideIcon {
  if (input.kind === 'process') {
    return firstMatch(PROCESS_RULES, foldForMatch(`${input.key ?? ''} ${input.label}`)) ?? Factory;
  }
  if (input.type === 'semi') return Layers;
  if (input.type === 'finished') return PackageCheck;
  const folded = foldForMatch(input.name);
  if (input.type === 'packaging') return firstMatch(PACKAGING_RULES, folded) ?? Package;
  // Hammaddede de ambalaj kelimeleri geçebilir (ör. tipi yanlış girilmiş etiket) — önce hammadde kuralları.
  return firstMatch(MATERIAL_RULES, folded) ?? firstMatch(PACKAGING_RULES, folded) ?? Leaf;
}

/** Düğüm tipi → Türkçe rozet etiketi */
export const NODE_KIND_LABELS: Record<BomNodeKind, string> = {
  raw: 'Hammadde',
  packaging: 'Ambalaj',
  semi: 'Yarı mamul',
  finished: 'Mamul',
};
