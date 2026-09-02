import { randomUUID } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailInput, EmailMessenger, IntegrationMode, MessageResult } from '../types.js';

/**
 * SMTP (nodemailer) e-posta adaptörü.
 * `SMTP_URL` env'de yoksa sandbox: gönderim yapılmaz, `{ ok, providerId, sandbox:true }` döner.
 */

const computeMode = (): IntegrationMode => (process.env.SMTP_URL ? 'live' : 'sandbox');

let cachedTransporter: Transporter | null = null;
let cachedUrl: string | undefined;

function getTransporter(): Transporter {
  const url = process.env.SMTP_URL!;
  if (!cachedTransporter || cachedUrl !== url) {
    cachedTransporter = nodemailer.createTransport(url);
    cachedUrl = url;
  }
  return cachedTransporter;
}

async function sandboxSend(): Promise<MessageResult> {
  return { ok: true, providerId: `sandbox-email-${randomUUID()}`, sandbox: true };
}

async function liveSend(input: EmailInput): Promise<MessageResult> {
  try {
    const info = await getTransporter().sendMail({
      from: process.env.SMTP_FROM ?? 'Plantero ERP <noreply@plantero.local>',
      to: input.to,
      subject: input.subject,
      text: input.body,
      html: input.html,
      attachments: input.attachments,
    });
    return { ok: true, providerId: info.messageId, sandbox: false };
  } catch (err) {
    return { ok: false, providerId: '', sandbox: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const email: EmailMessenger = {
  get mode() {
    return computeMode();
  },
  sendEmail: (input) => (computeMode() === 'sandbox' ? sandboxSend() : liveSend(input)),
};
