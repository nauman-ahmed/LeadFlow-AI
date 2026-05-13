export type Language = 'en' | 'fr';

export interface StartResponse {
  session_id: string;
  language: Language;
  greeting: string;
  tenant_name?: string;
}

export interface ProposedSlot {
  start: string;
  end?: string;
}

export interface PendingBooking {
  name: string | null;
  email: string;
  timezone: string;
}

export interface BookingBlock {
  pending: PendingBooking | null;
  proposed_slots: ProposedSlot[] | null;
  note: string | null;
  missing: Array<'name' | 'email'>;
}

export interface QualificationBlock {
  score: number;
  qualified: boolean;
  intent: string;
  tags: string[];
}

export interface MessageResponse {
  session_id: string;
  reply: string;
  language: Language;
  lead_id: string;
  conversation_id: string;
  is_new_lead: boolean;
  prompt_version?: string;
  qualification?: QualificationBlock;
  booking?: BookingBlock;
}

export interface BookResponse {
  session_id: string;
  lead_id: string;
  conversation_id: string;
  appointment: {
    cal_booking_id: string;
    cal_booking_numeric_id: number;
    start_at: string;
    end_at: string;
    timezone: string;
    meeting_url: string | null;
  };
  reply: string;
}

export async function startSession(
  apiUrl: string,
  opts: { language: Language; timezone?: string }
): Promise<StartResponse> {
  const res = await fetch(`${apiUrl}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: opts.language,
      timezone: opts.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    })
  });
  if (!res.ok) throw new Error(`start ${res.status}`);
  return res.json();
}

export async function sendMessage(
  apiUrl: string,
  opts: { session_id: string; message: string; language: Language; timezone?: string }
): Promise<MessageResponse> {
  const res = await fetch(`${apiUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...opts,
      timezone: opts.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    })
  });
  if (!res.ok) throw new Error(`message ${res.status}`);
  return res.json();
}

export async function bookSlot(
  apiUrl: string,
  opts: {
    session_id: string;
    start: string;
    email: string;
    name?: string | null;
    timezone: string;
    language: Language;
  }
): Promise<BookResponse> {
  const res = await fetch(`${apiUrl}/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts)
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error ?? ''; } catch { /* noop */ }
    throw new Error(`book ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

export async function sendEvent(
  apiUrl: string,
  opts: { session_id: string; event: string; payload?: Record<string, unknown> }
): Promise<void> {
  await fetch(`${apiUrl}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts)
  }).catch(() => {});
}
