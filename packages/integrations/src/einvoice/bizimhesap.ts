import { randomUUID } from 'node:crypto';
import type { DespatchInput, DespatchResult, EInvoiceInput, EInvoiceProvider, EInvoiceResult, IntegrationMode } from '../types.js';

/**
 * Bizimhesap e-Fatura/e-Arşiv/e-İrsaliye entegrasyonu.
 * `BIZIMHESAP_API_KEY` env'de yoksa sandbox: UUID üretir, kısa bir gecikme simüle eder
 * ve 'accepted' döner. Varsa gerçek Bizimhesap REST API'sine `fetch` ile bağlanır.
 */

const computeMode = (): IntegrationMode => (process.env.BIZIMHESAP_API_KEY ? 'live' : 'sandbox');

const sandboxDelay = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const baseUrl = (): string => process.env.BIZIMHESAP_API_BASE_URL ?? 'https://api.bizimhesap.com';

function authHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.BIZIMHESAP_API_KEY}` };
}

async function sandboxSendInvoice(input: EInvoiceInput): Promise<EInvoiceResult> {
  await sandboxDelay();
  const uuid = randomUUID();
  return {
    ok: true,
    uuid,
    ettn: uuid,
    status: 'accepted',
    providerRef: `sandbox-${input.docNo}`,
    sandbox: true,
  };
}

async function liveSendInvoice(input: EInvoiceInput): Promise<EInvoiceResult> {
  const endpoint = process.env.BIZIMHESAP_INVOICE_ENDPOINT ?? '/v1/einvoice/send';
  try {
    const res = await fetch(`${baseUrl()}${endpoint}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(input) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, uuid: '', status: 'error', sandbox: false, error: (data.message as string) ?? `Bizimhesap HTTP ${res.status}` };
    }
    return {
      ok: true,
      uuid: (data.uuid as string) ?? (data.ettn as string) ?? '',
      ettn: data.ettn as string | undefined,
      status: (data.status as EInvoiceResult['status']) ?? 'queued',
      providerRef: data.id as string | undefined,
      sandbox: false,
    };
  } catch (err) {
    return { ok: false, uuid: '', status: 'error', sandbox: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sandboxSendDespatch(_input: DespatchInput): Promise<DespatchResult> {
  await sandboxDelay();
  return { ok: true, uuid: randomUUID(), status: 'accepted', sandbox: true };
}

async function liveSendDespatch(input: DespatchInput): Promise<DespatchResult> {
  const endpoint = process.env.BIZIMHESAP_DESPATCH_ENDPOINT ?? '/v1/edespatch/send';
  try {
    const res = await fetch(`${baseUrl()}${endpoint}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(input) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, uuid: '', status: 'error', sandbox: false, error: (data.message as string) ?? `Bizimhesap HTTP ${res.status}` };
    return { ok: true, uuid: (data.uuid as string) ?? '', status: (data.status as DespatchResult['status']) ?? 'queued', sandbox: false };
  } catch (err) {
    return { ok: false, uuid: '', status: 'error', sandbox: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function getStatus(uuid: string): Promise<{ status: string; sandbox: boolean }> {
  if (computeMode() === 'sandbox') return { status: 'accepted', sandbox: true };
  const endpoint = process.env.BIZIMHESAP_STATUS_ENDPOINT ?? '/v1/einvoice/status';
  try {
    const res = await fetch(`${baseUrl()}${endpoint}/${uuid}`, { headers: authHeaders() });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: (data.status as string) ?? 'unknown', sandbox: false };
  } catch {
    return { status: 'error', sandbox: false };
  }
}

export const bizimhesap: EInvoiceProvider = {
  get mode() {
    return computeMode();
  },
  sendInvoice: (input) => (computeMode() === 'sandbox' ? sandboxSendInvoice(input) : liveSendInvoice(input)),
  sendDespatch: (input) => (computeMode() === 'sandbox' ? sandboxSendDespatch(input) : liveSendDespatch(input)),
  getStatus,
};
