/**
 * Alan (domain) hataları. Server action sarmalayıcısı (`withAudit`) bunları
 * `{ ok: false, error }` olarak kullanıcıya gösterir; diğer hatalar genel mesaja düşer.
 */
export class DomainError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

/** Oturum yok / geçersiz */
export class UnauthorizedError extends DomainError {
  constructor(message = 'Oturum açmanız gerekiyor') {
    super('UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

/** Oturum var ama izin yok */
export class ForbiddenError extends DomainError {
  readonly permission?: string;
  constructor(permission?: string, message?: string) {
    super('FORBIDDEN', message ?? (permission ? `Bu işlem için yetkiniz yok: ${permission}` : 'Bu işlem için yetkiniz yok'), { permission });
    this.name = 'ForbiddenError';
    this.permission = permission;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id?: string) {
    super('NOT_FOUND', id ? `${entity} bulunamadı: ${id}` : `${entity} bulunamadı`, { entity, id });
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION', message, details);
    this.name = 'ValidationError';
  }
}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError;
