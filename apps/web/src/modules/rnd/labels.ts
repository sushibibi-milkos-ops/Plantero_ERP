import type { StatusTone } from '@/lib/status';

/** Proje durumu (`rnd_project_status`) → TR etiket + ton. */
export const PROJECT_STATUS_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  idea: { label: 'Fikir', tone: 'muted' },
  active: { label: 'Aktif', tone: 'primary' },
  on_hold: { label: 'Beklemede', tone: 'warning' },
  completed: { label: 'Tamamlandı', tone: 'success' },
  cancelled: { label: 'İptal', tone: 'danger' },
};

/** Deneme reçetesi versiyon durumu (`trial_status`) → TR etiket + ton. */
export const TRIAL_STATUS_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  draft: { label: 'Taslak', tone: 'muted' },
  testing: { label: 'Test/Onayda', tone: 'warning' },
  approved: { label: 'Onaylandı', tone: 'success' },
  rejected: { label: 'Reddedildi', tone: 'danger' },
  released: { label: 'Devredildi', tone: 'primary' },
};

/** Maliyet kaynağı (`trial_recipe_lines.cost_source`) → TR etiket. */
export const COST_SOURCE_LABELS: Record<string, string> = {
  average: 'Ortalama maliyet',
  last_purchase: 'Son alış fiyatı',
  manual: 'Manuel',
};

/** `packages/core/src/rnd/projects.ts`teki `DEFAULT_BOARD_COLUMNS` ile birebir — client bileşeninden
 *  doğrudan core dosyasını import edemeyiz (`@plantero/db`e bağımlı, client bundle'ı kırar). */
export const DEFAULT_COLUMNS = ['Fikir', 'Formülasyon', 'Pilot Üretim', 'Duyusal Test', 'Raf Ömrü', 'Onay'];

export const COST_SOURCE_OPTIONS = [
  { value: 'average', label: 'Ortalama' },
  { value: 'last_purchase', label: 'Son alış' },
  { value: 'manual', label: 'Manuel' },
] as const;
