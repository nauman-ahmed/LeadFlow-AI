import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { callN8n } from '@/lib/n8n';
import { createBooking, CalComError, defaultTimeZone } from '@/lib/calcom';
import { promptVersion } from '@/lib/prompts';
import type { Language } from '@/lib/types';

interface BookRequest {
  session_id?: string;
  start?: string;          // UTC ISO from the proposed_slots list
  name?: string;
  email?: string;
  timezone?: string;
  language?: Language;
}

/**
 * Confirms a Cal.com booking from a chat-proposed slot.
 *
 * Flow:
 *   1. Lookup conversation + lead by session_id.
 *   2. POST to Cal.com /v2/bookings (Cal handles the Google Calendar event).
 *   3. Upsert into Supabase `appointments` keyed by `cal_booking_id`.
 *   4. Update lead: status=booked, capture contact info if newer.
 *   5. Append assistant confirmation message to the transcript.
 *   6. Fire-and-forget `lead.booked` to n8n.
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

  // 1. Find the conversation + lead.
  const { data: conv, error: convErr } = await sb
    .from('conversations')
    .select('id, lead_id, language')
    .eq('external_id', sessionId)
    .maybeSingle();

  if (convErr || !conv) {
    return NextResponse.json(
      { error: `conversation lookup failed: ${convErr?.message ?? 'not found'}` },
      { status: 404 }
    );
  }
  const conversationId = conv.id;
  const leadId = conv.lead_id;
  const convLanguage = (conv.language as Language) || language;

  const { data: lead } = await sb
    .from('leads')
    .select('id, name, email, phone, status, tags')
    .eq('id', leadId)
    .maybeSingle();

  const attendeeName = (body.name || lead?.name || body.email.split('@')[0]).trim();
  const attendeeEmail = body.email.trim();
  const timezone = (body.timezone || defaultTimeZone()).trim();

  // 2. Cal.com booking.
  let booking;
  try {
    booking = await createBooking({
      start,
      attendee: {
        name: attendeeName,
        email: attendeeEmail,
        timeZone: timezone,
        language: convLanguage
      },
      metadata: {
        leadflow_session_id: sessionId,
        leadflow_lead_id: leadId,
        leadflow_conversation_id: conversationId
      }
    });
  } catch (err) {
    const status = err instanceof CalComError ? err.status || 502 : 500;
    const message = err instanceof Error ? err.message : 'booking failed';
    console.error('[chat/book] Cal.com createBooking failed', message);

    // Surface a localized assistant message in the transcript so the admin
    // dashboard reflects the failure even when the widget retries later.
    await sb.from('messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content:
        convLanguage === 'fr'
          ? "Désolé, je n'ai pas pu réserver ce créneau. Voulez-vous en essayer un autre ?"
          : "Sorry, I couldn't lock in that slot. Want to try a different one?",
      prompt_version: `booking-error-${promptVersion()}`
    });

    return NextResponse.json({ error: message }, { status });
  }

  // 3. Upsert into Supabase appointments (idempotent on cal_booking_id).
  const { error: apptErr } = await sb
    .from('appointments')
    .upsert(
      {
        lead_id: leadId,
        cal_booking_id: booking.uid,
        start_at: booking.start,
        end_at: booking.end,
        status: 'booked'
      },
      { onConflict: 'cal_booking_id' }
    );

  if (apptErr) {
    // Booking exists on Cal.com but we couldn't mirror it. Still acknowledge to
    // the user — the Cal webhook will reconcile when it eventually fires.
    console.error('[chat/book] appointments upsert failed', apptErr.message);
  }

  // 4. Update lead: status=booked, capture contact info.
  const existingTags: string[] = lead?.tags ?? [];
  const newTags = Array.from(new Set([...existingTags, 'booked', `intent:demo`]));
  await sb
    .from('leads')
    .update({
      status: 'booked',
      name: lead?.name ?? attendeeName,
      email: lead?.email ?? attendeeEmail,
      tags: newTags
    })
    .eq('id', leadId);

  // 5. Append assistant confirmation message.
  const localStart = new Date(booking.start).toLocaleString(convLanguage === 'fr' ? 'fr-FR' : 'en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone
  });
  const confirmation =
    convLanguage === 'fr'
      ? `C'est confirmé ! Vous êtes prévu(e) le ${localStart} (${timezone}). Vous recevrez un email de Cal.com avec le lien de la réunion.`
      : `You're booked! See you on ${localStart} (${timezone}). You'll get an email from Cal.com with the meeting link.`;

  await sb.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: confirmation,
    prompt_version: `booking-confirmed-${promptVersion()}`
  });

  // 6. Fire-and-forget CRM sync.
  callN8n('/leadflow/crm-sync', {
    event: 'lead.booked',
    lead: { id: leadId, source: 'web', language: convLanguage, status: 'booked' },
    conversation: { id: conversationId, channel: 'web' },
    appointment: {
      cal_booking_id: booking.uid,
      cal_booking_numeric_id: booking.id,
      start_at: booking.start,
      end_at: booking.end,
      timezone,
      meeting_url: booking.hostsMeetingUrl ?? null
    },
    contact: { name: attendeeName, email: attendeeEmail },
    correlation_id: sessionId,
    timestamp: new Date().toISOString()
  }).catch((err) => console.error('[chat/book] crm-sync failed', err));

  return NextResponse.json({
    session_id: sessionId,
    lead_id: leadId,
    conversation_id: conversationId,
    appointment: {
      cal_booking_id: booking.uid,
      cal_booking_numeric_id: booking.id,
      start_at: booking.start,
      end_at: booking.end,
      timezone,
      meeting_url: booking.hostsMeetingUrl ?? null
    },
    reply: confirmation
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
