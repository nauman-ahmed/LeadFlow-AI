import type { SupabaseClient } from '@supabase/supabase-js';
import { callN8n } from '@/lib/n8n';
import { createBooking, CalComError, defaultTimeZone } from '@/lib/calcom';
import { promptVersion } from '@/lib/prompts';
import type { Language } from '@/lib/types';

export type BookingChannel = 'web' | 'voice';

export interface ConfirmIntroCalBookingInput {
  externalId: string;
  start: string;
  email: string;
  name?: string;
  timezone?: string;
  language?: Language;
  channel: BookingChannel;
}

export type ConfirmIntroCalBookingResult =
  | {
      ok: true;
      leadId: string;
      conversationId: string;
      confirmation: string;
      appointment: {
        cal_booking_id: string;
        cal_booking_numeric_id: number;
        start_at: string;
        end_at: string;
        timezone: string;
        meeting_url: string | null;
      };
    }
  | { ok: false; status: number; message: string };

/**
 * Shared Cal.com intro booking path for web (`session_id`) and voice (`vapi_call_id`).
 */
export async function confirmIntroCalBooking(
  sb: SupabaseClient,
  input: ConfirmIntroCalBookingInput
): Promise<ConfirmIntroCalBookingResult> {
  const {
    externalId,
    start,
    email,
    name: nameOverride,
    timezone: tzOverride,
    language: langOverride,
    channel
  } = input;

  const language: Language = langOverride === 'fr' ? 'fr' : 'en';

  const { data: conv, error: convErr } = await sb
    .from('conversations')
    .select('id, lead_id, language')
    .eq('external_id', externalId)
    .maybeSingle();

  if (convErr || !conv) {
    return {
      ok: false,
      status: 404,
      message: `conversation lookup failed: ${convErr?.message ?? 'not found'}`
    };
  }

  const conversationId = conv.id;
  const leadId = conv.lead_id;
  const convLanguage = (conv.language as Language) || language;

  const { data: lead } = await sb
    .from('leads')
    .select('id, name, email, phone, status, tags')
    .eq('id', leadId)
    .maybeSingle();

  const attendeeName = (nameOverride || lead?.name || email.split('@')[0]).trim();
  const attendeeEmail = email.trim();
  const timezone = (tzOverride || defaultTimeZone()).trim();

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
        leadflow_session_id: externalId,
        leadflow_lead_id: leadId,
        leadflow_conversation_id: conversationId,
        leadflow_channel: channel
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'booking failed';
    console.error('[confirmIntroCalBooking] Cal.com createBooking failed', message);

    await sb.from('messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content:
        convLanguage === 'fr'
          ? "Désolé, je n'ai pas pu réserver ce créneau. Voulez-vous en essayer un autre ?"
          : "Sorry, I couldn't lock in that slot. Want to try a different one?",
      prompt_version: `booking-error-${promptVersion()}`
    });

    const status = err instanceof CalComError ? err.status || 502 : 500;
    return { ok: false, status, message };
  }

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
    console.error('[confirmIntroCalBooking] appointments upsert failed', apptErr.message);
  }

  const existingTags: string[] = lead?.tags ?? [];
  const newTags = Array.from(new Set([...existingTags, 'booked', 'intent:demo']));
  await sb
    .from('leads')
    .update({
      status: 'booked',
      name: lead?.name ?? attendeeName,
      email: lead?.email ?? attendeeEmail,
      tags: newTags
    })
    .eq('id', leadId);

  const localStart = new Date(booking.start).toLocaleString(
    convLanguage === 'fr' ? 'fr-FR' : 'en-US',
    {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone
    }
  );
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

  callN8n('/leadflow/crm-sync', {
    event: 'lead.booked',
    lead: { id: leadId, source: channel, language: convLanguage, status: 'booked' },
    conversation: { id: conversationId, channel },
    appointment: {
      cal_booking_id: booking.uid,
      cal_booking_numeric_id: booking.id,
      start_at: booking.start,
      end_at: booking.end,
      timezone,
      meeting_url: booking.hostsMeetingUrl ?? null
    },
    contact: { name: attendeeName, email: attendeeEmail },
    correlation_id: externalId,
    timestamp: new Date().toISOString()
  }).catch((err) => console.error('[confirmIntroCalBooking] crm-sync failed', err));

  return {
    ok: true,
    leadId,
    conversationId,
    confirmation,
    appointment: {
      cal_booking_id: booking.uid,
      cal_booking_numeric_id: booking.id,
      start_at: booking.start,
      end_at: booking.end,
      timezone,
      meeting_url: booking.hostsMeetingUrl ?? null
    }
  };
}
