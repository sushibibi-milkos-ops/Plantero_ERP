import { QUEUES } from '../queues.js';
import { runCashflowRecompute } from './cashflowRecompute.js';
import { runDunningScheduler } from './dunningScheduler.js';
import { processEinvoiceSend, type EinvoiceSendJobData } from './einvoiceSend.js';
import { runExpiryAlerts } from './expiryAlerts.js';
import { runMaintenanceScheduler } from './maintenanceScheduler.js';
import { runMarketplaceSync } from './marketplaceSync.js';
import { processNotification, type NotificationJobData } from './notifications.js';
import { runOeeDaily } from './oeeDaily.js';
import { runReconciliationNightly } from './reconciliationNightly.js';
import { runReplenishmentEngine } from './replenishmentEngine.js';
import { runTcmbRates } from './tcmbRates.js';
import { runVatMonthlyClose } from './vatMonthlyClose.js';

/** Zamanlanmış (cron) işler: kuyruk adı → çalıştırıcı fonksiyon */
export const CRON_JOB_HANDLERS: Record<string, () => Promise<Record<string, unknown>>> = {
  [QUEUES.reconciliationNightly.name]: runReconciliationNightly,
  [QUEUES.marketplaceSync.name]: runMarketplaceSync,
  [QUEUES.replenishmentEngine.name]: runReplenishmentEngine,
  [QUEUES.dunningScheduler.name]: runDunningScheduler,
  [QUEUES.tcmbRates.name]: runTcmbRates,
  [QUEUES.expiryAlerts.name]: runExpiryAlerts,
  [QUEUES.maintenanceScheduler.name]: runMaintenanceScheduler,
  [QUEUES.oeeDaily.name]: runOeeDaily,
  [QUEUES.cashflowRecompute.name]: runCashflowRecompute,
  [QUEUES.vatMonthlyClose.name]: runVatMonthlyClose,
};

/** Anlık (on-demand) işler: kuyruk adı → iş verisini işleyen fonksiyon */
export const ON_DEMAND_PROCESSORS: Record<string, (data: unknown) => Promise<Record<string, unknown>>> = {
  [QUEUES.einvoiceSend.name]: (data) => processEinvoiceSend(data as EinvoiceSendJobData),
  [QUEUES.notifications.name]: (data) => processNotification(data as NotificationJobData),
};
