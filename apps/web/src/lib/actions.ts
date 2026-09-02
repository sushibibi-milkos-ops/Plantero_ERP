import 'server-only';
import { db } from '@plantero/db';
import { writeAudit } from '@plantero/core/audit/index';
import { ForbiddenError } from '@plantero/core/auth/errors';
import { ZodError } from 'zod';
import { getCurrentUser, type UserCtx } from './auth';

/**
 * Server action sonuç tipi. Bileşenler `ok` üzerinden dallanır;
 * `fieldErrors` form alanlarına eşlenir.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type AuditAction = 'create' | 'update' | 'delete' | 'post' | 'cancel' | 'approve' | 'reject' | 'login' | 'import' | 'sync' | 'other';

export type AuditInfo = {
  action: AuditAction;
  tableName: string;
  recordId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
};

/** İş fonksiyonunun dönüşü: veri + audit bilgisi (audit yoksa satır yazılmaz) */
export type WithAuditReturn<T> = { data: T; audit?: AuditInfo | AuditInfo[]; message?: string };

export type ActionContext = { user: UserCtx | null };

function errorMessage(err: unknown): string {
  if (err instanceof ForbiddenError) return 'Bu işlem için yetkiniz yok.';
  if (err instanceof ZodError) return 'Form alanlarında hata var.';
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return 'Beklenmeyen bir hata oluştu.';
}

function zodFieldErrors(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.map(String).join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Server action sarmalayıcısı.
 * - Hataları yakalar → `{ ok: false, error }` (ForbiddenError ve ZodError özel mesaj alır)
 * - Başarıda `audit` bilgisi varsa `audit_log` satırı yazar (kullanıcı, ip, requestId ile)
 * - Yetki kontrolü iş fonksiyonunun içinde `requirePermission` ile yapılır (sözleşme #5)
 *
 * Kullanım:
 * ```ts
 * export const createOrder = withAudit('sales.createOrder', async (input: Input) => {
 *   const user = await requirePermission('sales.order');
 *   const order = await db.transaction(async (tx) => ...);
 *   return { data: order, audit: { action: 'create', tableName: 'sales_orders', recordId: order.id, summary: `Sipariş ${order.docNo} oluşturuldu`, after: order } };
 * });
 * ```
 */
export function withAudit<TArgs extends unknown[], TData>(
  name: string,
  fn: (...args: TArgs) => Promise<WithAuditReturn<TData>>,
): (...args: TArgs) => Promise<ActionResult<TData>> {
  return async (...args: TArgs): Promise<ActionResult<TData>> => {
    try {
      const result = await fn(...args);
      if (result.audit) {
        const user = await getCurrentUser();
        const ctx = user?.actor ?? { userId: null, userEmail: undefined };
        const entries = Array.isArray(result.audit) ? result.audit : [result.audit];
        for (const a of entries) {
          try {
            await writeAudit(
              db,
              {
                action: a.action,
                tableName: a.tableName,
                recordId: a.recordId ?? null,
                summary: a.summary ?? name,
                before: a.before,
                after: a.after,
              },
              ctx,
            );
          } catch (auditErr) {
            // Audit yazımı işi geri almaz ama sessiz de geçilmez
            console.error(`[withAudit:${name}] audit satırı yazılamadı`, auditErr);
          }
        }
      }
      return { ok: true, data: result.data, message: result.message };
    } catch (err) {
      // Next'in redirect()/notFound() sinyalleri yeniden fırlatılır
      if (err && typeof err === 'object' && 'digest' in err && typeof (err as { digest: unknown }).digest === 'string') {
        const digest = (err as { digest: string }).digest;
        if (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND')) throw err;
      }
      if (err instanceof ZodError) {
        return { ok: false, error: errorMessage(err), fieldErrors: zodFieldErrors(err) };
      }
      if (!(err instanceof ForbiddenError)) console.error(`[action:${name}]`, err);
      return { ok: false, error: errorMessage(err) };
    }
  };
}
