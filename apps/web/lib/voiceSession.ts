import type { SupabaseClient } from '@supabase/supabase-js';
import type { Language } from '@/lib/types';

export interface VoiceConversationContext {
  callId: string;
  leadId: string;
  conversationId: string;
  language: Language;
}

function asLanguage(v: unknown): Language {
  return v === 'fr' ? 'fr' : 'en';
}

/**
 * Ensures a `leads` + `conversations` row exists for this Vapi call id (`external_id`).
 */
export async function ensureVoiceConversation(
  sb: SupabaseClient,
  callId: string,
  languageGuess: unknown
): Promise<VoiceConversationContext> {
  const language = asLanguage(languageGuess);

  const { data: existing, error: lookupErr } = await sb
    .from('conversations')
    .select('id, lead_id, language')
    .eq('external_id', callId)
    .maybeSingle();

  if (lookupErr) {
    throw new Error(`voice conversation lookup failed: ${lookupErr.message}`);
  }

  if (existing) {
    return {
      callId,
      leadId: existing.lead_id,
      conversationId: existing.id,
      language: asLanguage(existing.language)
    };
  }

  const { data: newLead, error: leadErr } = await sb
    .from('leads')
    .insert({
      source: 'voice',
      language,
      status: 'new',
      tags: ['source:voice', `lang:${language}`]
    })
    .select('id')
    .single();

  if (leadErr || !newLead) {
    throw new Error(`voice lead insert failed: ${leadErr?.message ?? 'unknown'}`);
  }

  const { data: newConv, error: convErr } = await sb
    .from('conversations')
    .insert({
      lead_id: newLead.id,
      channel: 'voice',
      external_id: callId,
      language
    })
    .select('id')
    .single();

  if (convErr || !newConv) {
    throw new Error(`voice conversation insert failed: ${convErr?.message ?? 'unknown'}`);
  }

  return {
    callId,
    leadId: newLead.id,
    conversationId: newConv.id,
    language
  };
}
