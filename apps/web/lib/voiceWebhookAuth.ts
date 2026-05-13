import { env } from '@/lib/env';

export class VoiceWebhookAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'VoiceWebhookAuthError';
    this.status = status;
  }
}

/**
 * Secures `/api/voice/server`. Accepts the same secret as `N8N_WEBHOOK_SECRET` /
 * `VAPI_WEBHOOK_SECRET`, sent as any of:
 * - `x-leadflow-secret` (LeadFlow / n8n convention)
 * - `Authorization: Bearer <secret>` (Vapi “Bearer Token” credential, default header)
 * - `X-Vapi-Secret` (Vapi legacy / “X-Vapi-Secret” credential header — see Vapi server auth docs)
 */
export function assertVoiceServerAuthorized(req: Request): void {
  const configured = (env.VAPI_WEBHOOK_SECRET || env.N8N_WEBHOOK_SECRET).trim();
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new VoiceWebhookAuthError(
        'Set VAPI_WEBHOOK_SECRET or N8N_WEBHOOK_SECRET before exposing voice webhooks in production.',
        503
      );
    }
    return;
  }

  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')?.trim();
  const headerSecret =
    req.headers.get('x-leadflow-secret')?.trim() ||
    req.headers.get('X-Leadflow-Secret')?.trim() ||
    req.headers.get('x-vapi-secret')?.trim() ||
    req.headers.get('X-Vapi-Secret')?.trim() ||
    bearer ||
    '';

  if (headerSecret !== configured) {
    if (process.env.NODE_ENV !== 'production') {
      const present: string[] = [];
      for (const h of [
        'authorization',
        'x-leadflow-secret',
        'X-Leadflow-Secret',
        'x-vapi-secret',
        'X-Vapi-Secret'
      ]) {
        if (req.headers.get(h)) present.push(h);
      }
      console.warn(
        '[voice/webhook] 401 auth failed. Incoming auth header names (not values):',
        present.length ? present.join(', ') : '(none — Vapi may not be attaching a credential to this URL)'
      );
      console.warn(
        '[voice/webhook] Env expects token from VAPI_WEBHOOK_SECRET or N8N_WEBHOOK_SECRET (first non-empty wins).'
      );
    }

    const hint = headerSecret
      ? 'invalid voice webhook secret (header present but does not match VAPI_WEBHOOK_SECRET / N8N_WEBHOOK_SECRET in .env)'
      : 'missing voice webhook auth: use x-leadflow-secret, X-Vapi-Secret, or Authorization: Bearer with the same value as VAPI_WEBHOOK_SECRET or N8N_WEBHOOK_SECRET';

    throw new VoiceWebhookAuthError(hint, 401);
  }
}
