export type Language = 'en' | 'fr';

export interface StartResponse {
  session_id: string;
  language: Language;
  greeting: string;
  tenant_name?: string;
}

export interface MessageResponse {
  session_id: string;
  reply: string;
  language: Language;
  lead_id: string;
  conversation_id: string;
  is_new_lead: boolean;
  prompt_version?: string;
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
  opts: { session_id: string; message: string; language: Language }
): Promise<MessageResponse> {
  const res = await fetch(`${apiUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts)
  });
  if (!res.ok) throw new Error(`message ${res.status}`);
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
