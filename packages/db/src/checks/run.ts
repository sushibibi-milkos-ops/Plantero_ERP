import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/**
 * Veri bütünlüğü kontrol koşucusu (docs/INVARIANTS.md — I1..I17).
 *
 * Her `NN_isim.sql` dosyası ihlal SATIRLARINI döndürür (0 satır = o kural geçti).
 * Kolonlar: rule, entity, id, expected, actual, diff (numeric, yuvarlama yok).
 *
 * Kullanım:
 *   tsx src/checks/run.ts                → tüm kuralları çalıştır, tablo yazdır
 *   tsx src/checks/run.ts --rule 09      → yalnızca 09_*.sql
 *   tsx src/checks/run.ts --json         → JSON çıktı (stdout)
 *
 * Çıkış kodu: toplam ihlal satırı > 0 ise 1, aksi halde 0.
 */

type ViolationRow = {
  rule: string;
  entity: string;
  id: string;
  expected: string | number | null;
  actual: string | number | null;
  diff: string | number | null;
};

type RuleResult = {
  file: string;
  rule: string;
  ok: boolean;
  violationCount: number;
  sample: ViolationRow[];
  error?: string;
};

const CHECKS_DIR = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]): { rule: string | null; json: boolean } {
  const ruleIdx = argv.indexOf('--rule');
  const rule = ruleIdx !== -1 ? (argv[ruleIdx + 1] ?? null) : null;
  const json = argv.includes('--json');
  return { rule, json };
}

async function listCheckFiles(ruleFilter: string | null): Promise<string[]> {
  const entries = await readdir(CHECKS_DIR);
  const sqlFiles = entries.filter((f) => /^\d{2}_.+\.sql$/.test(f)).sort();
  if (!ruleFilter) return sqlFiles;
  const normalized = ruleFilter.replace(/^I/i, '').padStart(2, '0');
  return sqlFiles.filter((f) => f.startsWith(`${normalized}_`));
}

function ruleCodeFromFile(file: string): string {
  const n = file.slice(0, 2);
  return `I${Number(n)}`;
}

async function runOne(sql: ReturnType<typeof postgres>, file: string): Promise<RuleResult> {
  const rule = ruleCodeFromFile(file);
  const fullPath = path.join(CHECKS_DIR, file);
  const text = await readFile(fullPath, 'utf-8');
  try {
    const rows = (await sql.unsafe(text)) as unknown as ViolationRow[];
    return {
      file,
      rule,
      ok: rows.length === 0,
      violationCount: rows.length,
      sample: rows.slice(0, 5),
    };
  } catch (err) {
    return {
      file,
      rule,
      ok: false,
      violationCount: -1,
      sample: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function fmtCell(v: string | number | null): string {
  if (v === null || v === undefined) return '-';
  return String(v);
}

function printTable(results: RuleResult[]): void {
  const rows = results.map((r) => ({
    kural: r.rule,
    durum: r.error ? 'HATA' : r.ok ? 'GEÇTİ' : 'İHLAL',
    ihlalSayisi: r.error ? '-' : String(r.violationCount),
    dosya: r.file,
  }));
  const widths = {
    kural: Math.max(5, ...rows.map((r) => r.kural.length)),
    durum: Math.max(5, ...rows.map((r) => r.durum.length)),
    ihlalSayisi: Math.max(10, ...rows.map((r) => r.ihlalSayisi.length)),
    dosya: Math.max(5, ...rows.map((r) => r.dosya.length)),
  };
  const pad = (s: string, w: number) => s.padEnd(w);
  console.log(
    `${pad('Kural', widths.kural)}  ${pad('Durum', widths.durum)}  ${pad('İhlal Sayısı', widths.ihlalSayisi)}  Dosya`,
  );
  console.log('-'.repeat(widths.kural + widths.durum + widths.ihlalSayisi + widths.dosya + 6));
  for (const r of rows) {
    console.log(`${pad(r.kural, widths.kural)}  ${pad(r.durum, widths.durum)}  ${pad(r.ihlalSayisi, widths.ihlalSayisi)}  ${r.dosya}`);
  }
  console.log();

  for (const r of results) {
    if (r.error) {
      console.log(`[${r.rule}] HATA (${r.file}): ${r.error}`);
      continue;
    }
    if (!r.ok) {
      console.log(`[${r.rule}] ${r.violationCount} ihlal — ilk ${r.sample.length} örnek:`);
      for (const row of r.sample) {
        console.log(
          `  entity=${row.entity} id=${row.id} expected=${fmtCell(row.expected)} actual=${fmtCell(row.actual)} diff=${fmtCell(row.diff)}`,
        );
      }
    }
  }
}

async function main(): Promise<void> {
  const { rule, json } = parseArgs(process.argv.slice(2));
  const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/plantero';
  const sql = postgres(url, { max: 1, onnotice: () => {} });

  const files = await listCheckFiles(rule);
  if (files.length === 0) {
    console.error(`[db:check] eşleşen kural dosyası yok (--rule ${rule ?? ''})`);
    await sql.end();
    process.exitCode = 1;
    return;
  }

  const results: RuleResult[] = [];
  for (const file of files) {
    results.push(await runOne(sql, file));
  }
  await sql.end();

  const totalViolations = results.reduce((acc, r) => acc + (r.error ? 1 : r.violationCount), 0);

  if (json) {
    console.log(JSON.stringify({ results, totalViolations, passed: totalViolations === 0 }, null, 2));
  } else {
    printTable(results);
    console.log(`Toplam ihlal: ${totalViolations} — ${totalViolations === 0 ? 'TÜM KURALLAR GEÇTİ' : 'İHLAL VAR'}`);
  }

  process.exitCode = totalViolations > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('[db:check] beklenmeyen hata:', err);
  process.exitCode = 1;
});
