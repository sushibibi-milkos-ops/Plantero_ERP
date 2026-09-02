import type {
  documentOriginEnum, documentTypeEnum, stockMoveKindEnum, ledgerEnum, lotStatusEnum, locationUsageEnum,
  auditActionEnum, productTypeEnum,
} from '@plantero/db';

/** Her yazma servisine geçilen aktör bağlamı (audit için) */
export type ActorCtx = { userId: string | null; userEmail?: string; requestId?: string; ip?: string };

export const SYSTEM_ACTOR: ActorCtx = { userId: null, userEmail: 'system@plantero.local' };

export type DocumentOrigin = (typeof documentOriginEnum.enumValues)[number];
export type DocumentType = (typeof documentTypeEnum.enumValues)[number];
export type StockMoveKind = (typeof stockMoveKindEnum.enumValues)[number];
export type Ledger = (typeof ledgerEnum.enumValues)[number];
export type LotStatus = (typeof lotStatusEnum.enumValues)[number];
export type LocationUsage = (typeof locationUsageEnum.enumValues)[number];
export type AuditAction = (typeof auditActionEnum.enumValues)[number];
export type ProductType = (typeof productTypeEnum.enumValues)[number];

/** Oturumdan çözülen kullanıcı bağlamı */
export type UserCtx = {
  user: { id: string; email: string; fullName: string; locale: string; avatarUrl: string | null };
  roles: string[];
  permissions: string[];
  sessionId?: string;
};
