/**
 * Kuyruk adları ve zamanlama (ARCHITECTURE.md §12).
 * Cron ifadeleri Europe/Istanbul yerel saatine göre değerlendirilir.
 */

export const TZ = 'Europe/Istanbul';

export type QueueDef = { name: string; cron: string | null };

export const QUEUES = {
  reconciliationNightly: { name: 'reconciliation-nightly', cron: '0 2 * * *' },
  marketplaceSync: { name: 'marketplace-sync', cron: '*/15 * * * *' },
  replenishmentEngine: { name: 'replenishment-engine', cron: '0 6 * * *' },
  dunningScheduler: { name: 'dunning-scheduler', cron: '0 9 * * *' },
  tcmbRates: { name: 'tcmb-rates', cron: '0 16 * * *' },
  expiryAlerts: { name: 'expiry-alerts', cron: '0 7 * * *' },
  maintenanceScheduler: { name: 'maintenance-scheduler', cron: '0 5 * * *' },
  oeeDaily: { name: 'oee-daily', cron: '30 23 * * *' },
  cashflowRecompute: { name: 'cashflow-recompute', cron: '0 3 * * *' },
  // Anlık kuyruklar: cron yok, iş kalemleri diğer modüllerin server action'larından `queue.add(...)` ile eklenir.
  einvoiceSend: { name: 'einvoice-send', cron: null },
  notifications: { name: 'notifications', cron: null },
} as const satisfies Record<string, QueueDef>;

export type QueueKey = keyof typeof QUEUES;

export const CRON_QUEUE_NAMES = Object.values(QUEUES)
  .filter((q) => q.cron !== null)
  .map((q) => q.name);

export const ON_DEMAND_QUEUE_NAMES = Object.values(QUEUES)
  .filter((q) => q.cron === null)
  .map((q) => q.name);
