// Cal.com v2 API client + webhook HMAC verifier.
//
// Endpoints used:
//   GET  /v2/slots               header cal-api-version: 2024-09-04
//   POST /v2/bookings            header cal-api-version: 2026-02-25
//   POST /v2/bookings/:uid/cancel
//
// Docs (current as of 2026-05): https://cal.com/docs/api-reference/v2/
//
// Design notes:
//   - All functions throw `CalComError` with a friendly message. The chat API
//     route is expected to catch + degrade gracefully.
//   - Slot times come back as UTC ISO strings; we keep them that way through
//     Supabase. The widget formats them in the user's local tz at render time.

import { createHmac, timingSafeEqual } from 'node:crypto';

const CAL_API_BASE = 'https://api.cal.com';
const SLOTS_API_VERSION = '2024-09-04';
const BOOKINGS_API_VERSION = '2026-02-25';
const CANCEL_API_VERSION = '2024-08-13';

export class CalComError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status = 0, body: unknown = null) {
    super(message);
    this.name = 'CalComError';
    this.status = status;
    this.body = body;
  }
}

function requireApiKey(): string {
  const key = process.env.CAL_API_KEY;
  if (!key) {
    throw new CalComError(
      'CAL_API_KEY is not set. Booking is unavailable until the demo Cal.com key is configured.',
      503
    );
  }
  return key;
}

function requireEventTypeId(override?: number): number {
  if (override && Number.isFinite(override)) return override;
  const raw = process.env.CAL_EVENT_TYPE_ID;
  const id = raw ? Number(raw) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    throw new CalComError(
      'CAL_EVENT_TYPE_ID is not set or invalid. Configure the Cal.com event type id in .env.',
      503
    );
  }
  return id;
}

export function defaultTimeZone(): string {
  return process.env.CAL_DEFAULT_TIMEZONE || 'UTC';
}

async function cal<T>(
  path: string,
  init: RequestInit & { apiVersion: string; timeoutMs?: number }
): Promise<T> {
  const apiKey = requireApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 15_000);

  try {
    const res = await fetch(`${CAL_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'cal-api-version': init.apiVersion,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      },
      signal: controller.signal
    });

    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep raw */ }

    if (!res.ok) {
      const message = (parsed as { error?: { message?: string } } | null)?.error?.message
        ?? `Cal.com ${path} returned ${res.status}`;
      throw new CalComError(message, res.status, parsed ?? text);
    }

    return parsed as T;
  } catch (err) {
    if (err instanceof CalComError) throw err;
    if ((err as { name?: string }).name === 'AbortError') {
      throw new CalComError(`Cal.com ${path} timed out`, 408);
    }
    throw new CalComError(`Cal.com ${path} fetch failed: ${(err as Error).message}`, 0);
  } finally {
    clearTimeout(timer);
  }
}

// -----------------------------------------------------------------------------
// Slots
// -----------------------------------------------------------------------------

export interface AvailableSlot {
  /** UTC ISO timestamp returned by Cal.com. */
  start: string;
  /** Optional end ISO when format=range is used. Derived locally otherwise. */
  end?: string;
}

interface SlotsApiResponse {
  status: 'success' | 'error';
  data: Record<string, { start: string; end?: string }[]>;
}

export interface CheckAvailabilityOptions {
  /** YYYY-MM-DD. Defaults to today (UTC). */
  start?: string;
  /** YYYY-MM-DD. Defaults to start + 14 days. */
  end?: string;
  /** IANA tz. Defaults to CAL_DEFAULT_TIMEZONE. */
  timeZone?: string;
  /** Override the configured event type. */
  eventTypeId?: number;
  /** Max slots to return after flattening. */
  limit?: number;
  /** Only return slots strictly in the future. Default true. */
  futureOnly?: boolean;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Fetch available slots over a window and flatten into a list. */
export async function checkAvailability(
  opts: CheckAvailabilityOptions = {}
): Promise<AvailableSlot[]> {
  const eventTypeId = requireEventTypeId(opts.eventTypeId);
  const timeZone = opts.timeZone || defaultTimeZone();
  const startStr = opts.start || toIsoDate(new Date());
  const endStr = opts.end || toIsoDate(new Date(Date.now() + 14 * 24 * 3600 * 1000));

  const url = new URL(`${CAL_API_BASE}/v2/slots`);
  url.searchParams.set('eventTypeId', String(eventTypeId));
  url.searchParams.set('start', startStr);
  url.searchParams.set('end', endStr);
  url.searchParams.set('timeZone', timeZone);

  const path = `/v2/slots?${url.searchParams.toString()}`;
  const res = await cal<SlotsApiResponse>(path, {
    method: 'GET',
    apiVersion: SLOTS_API_VERSION
  });

  if (res.status !== 'success' || !res.data) {
    throw new CalComError('Cal.com /v2/slots returned an unexpected payload', 502, res);
  }

  const now = Date.now();
  const limit = opts.limit ?? 24;
  const futureOnly = opts.futureOnly !== false;
  const flat: AvailableSlot[] = [];

  for (const day of Object.keys(res.data).sort()) {
    for (const slot of res.data[day] ?? []) {
      if (!slot?.start) continue;
      const t = Date.parse(slot.start);
      if (!Number.isFinite(t)) continue;
      if (futureOnly && t <= now) continue;
      flat.push({ start: slot.start, end: slot.end });
      if (flat.length >= limit) return flat;
    }
  }
  return flat;
}

// -----------------------------------------------------------------------------
// Bookings
// -----------------------------------------------------------------------------

export interface CreateBookingInput {
  /** UTC ISO start time (must match an available slot). */
  start: string;
  attendee: {
    name: string;
    email: string;
    timeZone: string;
    /** Cal.com supports a limited enum; we map fr/en safely; anything else → en. */
    language?: 'en' | 'fr';
    phoneNumber?: string;
  };
  /** Override the configured event type. */
  eventTypeId?: number;
  /** Free-form metadata round-tripped on webhooks. */
  metadata?: Record<string, string>;
  bookingFieldsResponses?: Record<string, unknown>;
}

export interface BookingResult {
  uid: string;
  id: number;
  start: string;
  end: string;
  eventTypeId: number;
  status: string;
  hostsMeetingUrl?: string;
  raw: unknown;
}

interface BookingsApiResponse {
  status: 'success' | 'error';
  data: {
    uid: string;
    id: number;
    start: string;
    end: string;
    eventTypeId: number;
    status: string;
    meetingUrl?: string;
    location?: string;
    [k: string]: unknown;
  };
}

export async function createBooking(input: CreateBookingInput): Promise<BookingResult> {
  const eventTypeId = requireEventTypeId(input.eventTypeId);
  const body = {
    start: input.start,
    eventTypeId,
    attendee: {
      name: input.attendee.name,
      email: input.attendee.email,
      timeZone: input.attendee.timeZone || defaultTimeZone(),
      language: input.attendee.language ?? 'en',
      ...(input.attendee.phoneNumber ? { phoneNumber: input.attendee.phoneNumber } : {})
    },
    ...(input.metadata ? { metadata: input.metadata } : {}),
    ...(input.bookingFieldsResponses ? { bookingFieldsResponses: input.bookingFieldsResponses } : {})
  };

  const res = await cal<BookingsApiResponse>('/v2/bookings', {
    method: 'POST',
    apiVersion: BOOKINGS_API_VERSION,
    body: JSON.stringify(body)
  });

  if (res.status !== 'success' || !res.data?.uid) {
    throw new CalComError('Cal.com booking response missing uid', 502, res);
  }

  return {
    uid: res.data.uid,
    id: res.data.id,
    start: res.data.start,
    end: res.data.end,
    eventTypeId: res.data.eventTypeId,
    status: res.data.status,
    hostsMeetingUrl: (res.data.meetingUrl as string | undefined) || (res.data.location as string | undefined),
    raw: res.data
  };
}

export async function cancelBooking(uid: string, reason = 'Cancelled by user'): Promise<void> {
  if (!uid) throw new CalComError('cancelBooking: uid required', 400);
  await cal<unknown>(`/v2/bookings/${encodeURIComponent(uid)}/cancel`, {
    method: 'POST',
    apiVersion: CANCEL_API_VERSION,
    body: JSON.stringify({ cancellationReason: reason })
  });
}

// -----------------------------------------------------------------------------
// Webhook signature verification
// -----------------------------------------------------------------------------

/**
 * Verify the HMAC-SHA256 signature Cal.com puts on outbound webhooks.
 * Cal sends `X-Cal-Signature-256: <hex>` computed over the raw request body
 * using the per-webhook secret.
 *
 * `rawBody` MUST be the unparsed request body string — re-stringifying a
 * parsed object will not match because key order / whitespace can differ.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null | undefined): boolean {
  const secret = process.env.CAL_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signatureHeader) return false;

  const provided = signatureHeader.trim().replace(/^sha256=/, '');
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// Tiny helpers used by both the chat route and the smoke script
// -----------------------------------------------------------------------------

export function isCalConfigured(): boolean {
  return Boolean(process.env.CAL_API_KEY) && Boolean(process.env.CAL_EVENT_TYPE_ID);
}

/**
 * Group + format slots for offer-to-user, picking up to N slots distributed
 * across the next few days. Keeps the UI tidy when Cal returns dozens.
 */
export function pickProposedSlots(slots: AvailableSlot[], count = 3): AvailableSlot[] {
  if (slots.length <= count) return slots;
  // Spread picks across the window for variety.
  const step = Math.floor(slots.length / count);
  const picked: AvailableSlot[] = [];
  for (let i = 0; i < count; i++) picked.push(slots[i * step]);
  return picked;
}
