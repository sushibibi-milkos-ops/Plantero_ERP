import { eq } from 'drizzle-orm';
import { db, jobRuns } from '@plantero/db';
import { sanitize } from '@plantero/core';

/**
 * Her job çalıştırmasını `job_runs` tablosunda görünür kılan sarmalayıcı.
 * Başlangıçta 'running' satırı açar; başarıda 'done' + sonuç, hatada 'failed' + hata mesajı yazar.
 */
export async function withJobRun<T extends Record<string, unknown>>(queue: string, name: string, fn: () => Promise<T>): Promise<T> {
  const [run] = await db.insert(jobRuns).values({ queue, name, status: 'running' }).returning({ id: jobRuns.id });
  const runId = run!.id;

  try {
    const result = await fn();
    await db.update(jobRuns).set({ status: 'done', finishedAt: new Date(), result: sanitize(result) }).where(eq(jobRuns.id, runId));
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(jobRuns).set({ status: 'failed', finishedAt: new Date(), error: message }).where(eq(jobRuns.id, runId));
    throw err;
  }
}
