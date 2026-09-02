import 'dotenv/config';
import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { CRON_JOB_HANDLERS, ON_DEMAND_PROCESSORS } from './jobs/index.js';
import { withJobRun } from './lib/run.js';
import { QUEUES, TZ, type QueueDef } from './queues.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const REDIS_CONNECT_TIMEOUT_MS = 3_000;

/**
 * Redis'e kısa zaman aşımıyla bağlanmayı dener. Redis yoksa/erişilemezse null döner —
 * çağıran in-process zamanlayıcıya düşer, süreç asla çökmez ya da uzun süre beklemez.
 */
async function connectRedis(): Promise<IORedis | null> {
  const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    enableOfflineQueue: false,
    retryStrategy: () => null, // otomatik yeniden deneme yok — biz karar veriyoruz
  });
  connection.on('error', () => {}); // bağlantı denemesi sırasındaki hataları burada sessizce yut

  try {
    await Promise.race([
      connection.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis bağlantı zaman aşımı')), REDIS_CONNECT_TIMEOUT_MS)),
    ]);
    return connection;
  } catch (err) {
    console.warn(`[worker] Redis bağlantısı kurulamadı (${REDIS_URL}); in-process zamanlayıcıya düşülüyor. Neden: ${err instanceof Error ? err.message : String(err)}`);
    connection.disconnect();
    return null;
  }
}

async function runCronJob(queueName: string): Promise<void> {
  const handler = CRON_JOB_HANDLERS[queueName];
  if (!handler) return;
  try {
    await withJobRun(queueName, queueName, handler);
  } catch (err) {
    console.error(`[worker] ${queueName} çalıştırması hata verdi:`, err instanceof Error ? err.message : err);
  }
}

async function runOnDemandJob(queueName: string, data: unknown): Promise<Record<string, unknown>> {
  const processor = ON_DEMAND_PROCESSORS[queueName];
  if (!processor) throw new Error(`Bilinmeyen kuyruk: ${queueName}`);
  return withJobRun(queueName, queueName, () => processor(data));
}

/* ------------------------------------------------------------------ */
/* BullMQ (Redis mevcutken)                                            */
/* ------------------------------------------------------------------ */

async function startBullMq(connection: IORedis): Promise<void> {
  const queueDefs = Object.values(QUEUES) as QueueDef[];

  for (const def of queueDefs) {
    const queue = new Queue(def.name, { connection });

    if (def.cron) {
      await queue.upsertJobScheduler(def.name, { pattern: def.cron, tz: TZ }, { opts: { removeOnComplete: 20, removeOnFail: 50 } });
       
      new Worker(def.name, () => runCronJob(def.name), { connection });
    } else {
       
      new Worker(def.name, (job) => runOnDemandJob(def.name, job.data), { connection });
    }
  }

  console.log(`[worker] BullMQ aktif (Redis: ${REDIS_URL}), ${queueDefs.length} kuyruk kayıtlı.`);
}

/* ------------------------------------------------------------------ */
/* In-process zamanlayıcı (Redis yokken düşülen yol)                    */
/* ------------------------------------------------------------------ */

function cronFieldMatches(field: string, value: number): boolean {
  if (field === '*') return true;
  return field.split(',').some((part) => {
    const step = /^\*\/(\d+)$/.exec(part);
    if (step) return value % Number(step[1]) === 0;
    return Number(part) === value;
  });
}

/** Europe/Istanbul yerel saatine göre 5 alanlı basit cron eşleştirme (min/saat/gün/ay/haftagünü) */
function cronMatchesIstanbul(cron: string, date: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const minute = Number(get('minute'));
  const hour = Number(get('hour'));
  const day = Number(get('day'));
  const month = Number(get('month'));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[get('weekday')] ?? 0;

  const [min, hr, dom, mon, dow] = cron.split(' ');
  return cronFieldMatches(min!, minute) && cronFieldMatches(hr!, hour) && cronFieldMatches(dom!, day) && cronFieldMatches(mon!, month) && cronFieldMatches(dow!, weekday);
}

function startInProcessScheduler(): void {
  const cronQueues = (Object.values(QUEUES) as QueueDef[]).filter((q): q is QueueDef & { cron: string } => q.cron !== null);
  const lastRunMinuteKey = new Map<string, string>();

  const tick = () => {
    const now = new Date();
    const minuteKey = now.toISOString().slice(0, 16); // dakika hassasiyeti
    for (const def of cronQueues) {
      if (lastRunMinuteKey.get(def.name) === minuteKey) continue;
      if (cronMatchesIstanbul(def.cron, now)) {
        lastRunMinuteKey.set(def.name, minuteKey);
        void runCronJob(def.name);
      }
    }
  };

  setInterval(tick, 60_000);
  console.log(`[worker] Redis yok — in-process zamanlayıcı aktif (${TZ}, dakikalık kontrol, ${cronQueues.length} zamanlanmış iş).`);
}

/* ------------------------------------------------------------------ */
/* Giriş noktası                                                       */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const connection = await connectRedis();
  if (connection) {
    await startBullMq(connection);
  } else {
    startInProcessScheduler();
  }
  console.log('[worker] Worker hazır');
}

main().catch((err) => {
  console.error('[worker] Başlatma hatası:', err);
  // Süreç çökmesin diye exit code set edilir ama process sonlandırılmaz; harici gözetim
  // (systemd/pm2/docker) yeniden başlatma politikasına göre karar verir.
  process.exitCode = 1;
});
