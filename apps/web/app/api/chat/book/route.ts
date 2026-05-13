import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { confirmIntroCalBooking } from '@/lib/confirmIntroCalBooking';
import type { Language } from '@/lib/types';

interface BookRequest {
  session_id?: string;
  start?: string;
  name?: string;
  email?: string;
  timezone?: string;
  language?: Language;
}

/**
 * Confirms a Cal.com booking from a chat-proposed slot.
 *
 * Flow: see `lib/confirmIntroCalBooking.ts` (shared with voice tools).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as BookRequest;
  const sessionId = body.session_id;
  const start = body.start;
  const language: Language = body.language === 'fr' ? 'fr' : 'en';

  if (!sessionId) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }
  if (!start) {
    return NextResponse.json({ error: 'start (UTC ISO) required' }, { status: 400 });
  }
  if (!body.email || !/.+@.+\..+/.test(body.email)) {
    return NextResponse.json({ error: 'valid email required' }, { status: 400 });
  }

  const sb = createServerClient();
  const result = await confirmIntroCalBooking(sb, {
    externalId: sessionId,
    start,
    email: body.email,
    name: body.name,
    timezone: body.timezone,
    language,
    channel: 'web'
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({
    session_id: sessionId,
    lead_id: result.leadId,
    conversation_id: result.conversationId,
    appointment: result.appointment,
    reply: result.confirmation
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
