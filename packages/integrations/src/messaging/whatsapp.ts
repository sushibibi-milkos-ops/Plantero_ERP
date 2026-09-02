import { randomUUID } from 'node:crypto';
import type { IntegrationMode, MessageResult, WhatsAppInput, WhatsAppMessenger } from '../types.js';

/**
 * WhatsApp Cloud API adaptörü.
 * `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` env'de yoksa sandbox: gönderim yapılmaz,
 * doğrudan `{ ok, providerId, sandbox:true }` döner (worker ilgili notifications kaydını günceller).
 */

const computeMode = (): IntegrationMode => (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID ? 'live' : 'sandbox');

async function sandboxSend(): Promise<MessageResult> {
  return { ok: true, providerId: `sandbox-wa-${randomUUID()}`, sandbox: true };
}

async function liveSend(input: WhatsAppInput): Promise<MessageResult> {
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: input.to,
        type: input.templateName ? 'template' : 'text',
        ...(input.templateName ? { template: { name: input.templateName, language: { code: 'tr' } } } : { text: { body: input.body } }),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = data.error as Record<string, unknown> | undefined;
      return { ok: false, providerId: '', sandbox: false, error: (err?.message as string) ?? `WhatsApp HTTP ${res.status}` };
    }
    const messages = data.messages as Array<{ id: string }> | undefined;
    return { ok: true, providerId: messages?.[0]?.id ?? '', sandbox: false };
  } catch (err) {
    return { ok: false, providerId: '', sandbox: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const whatsapp: WhatsAppMessenger = {
  get mode() {
    return computeMode();
  },
  sendWhatsApp: (input) => (computeMode() === 'sandbox' ? sandboxSend() : liveSend(input)),
};
