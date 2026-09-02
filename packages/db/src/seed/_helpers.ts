import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Seed bölümü konsol log'u — tek biçim, tüm seed dosyalarında kullanılır. */
export function log(section: string, message: string): void {
  console.log(`[seed:${section}] ${message}`);
}

/** Proje köküne göre data/import dosya yolu (packages/db içinden 2 seviye yukarı). */
export function dataImportPath(fileName: string): string {
  return path.resolve(import.meta.dirname, '../../../../data/import', fileName);
}

export async function readImportFile(fileName: string): Promise<Buffer> {
  return readFile(dataImportPath(fileName));
}

/** Seed sonunda tablo → satır sayısı özeti biriktirici */
export class SeedSummary {
  private rows: Array<{ table: string; count: number }> = [];
  add(table: string, count: number): void {
    this.rows.push({ table, count });
  }
  print(): void {
    console.log('\n=== Seed Özeti ===');
    const width = Math.max(...this.rows.map((r) => r.table.length), 5);
    for (const r of this.rows) console.log(`${r.table.padEnd(width)}  ${r.count}`);
    console.log('==================\n');
  }
}

export type SeedOnly = string[] | null;

/** `pnpm db:seed -- --only masterdata,accounting` gibi bir CLI argümanını çözer */
export function parseOnlyArg(argv: string[]): SeedOnly {
  const idx = argv.indexOf('--only');
  if (idx === -1 || !argv[idx + 1]) return null;
  return (argv[idx + 1] as string).split(',').map((s) => s.trim()).filter(Boolean);
}
