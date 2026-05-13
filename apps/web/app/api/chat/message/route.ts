import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { callN8n } from '@/lib/n8n';
import { searchKB, formatContext } from '@/lib/rag';
import { chat, type ChatMessage } from '@/lib/llm';
import { loadPrompt, fillTemplate, promptVersion } from '@/lib/prompts';
import { env } from '@/lib/env';
import type { Language } from '@/lib/types';
import { qualify, bookingReadiness, type TranscriptTurn } from '@/lib/qualify';
import {
  checkAvailability,
  pickProposedSlots,
  isCalConfigured,
  defaultTimeZone,
  type AvailableSlot,
  CalComError
} from '@/lib/calcom';

const HISTORY_TURNS = 6; // last N messages used as conversation context

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionId: string = body.session_id;
  const message: string = String(body.message ?? '').slice(0, 4000);
  const language: Language = body.language === 'fr' ? 'fr' : 'en';
  const timezone: string =
    (typeof body.timezone === 'string' && body.timezone) || defaultTimeZone();

  if (!sessionId || !message.trim()) {
    return NextResponse.json(
      { error: 'session_id and non-empty message required' },
      { status: 400 }
    );
  }

  const sb = createServerClient();

  // 1. Find or create the conversation (anchored by session_id).
  const { data: existing, error: lookupErr } = await sb
    .from('conversations')
    .select('id, lead_id')
    .eq('external_id', sessionId)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json({ error: `lookup failed: ${lookupErr.message}` }, { status: 500 });
  }

  let leadId: string;
  let conversationId: string;
  let isNewLead = false;

  if (existing) {
    leadId = existing.lead_id;
    conversationId = existing.id;
  } else {
    const { data: newLead, error: leadErr } = await sb
      .from('leads')
      .insert({
        source: 'web',
        language,
        status: 'new',
        tags: [`source:web`, `lang:${language}`]
      })
      .select('id')
      .single();

    if (leadErr || !newLead) {
      return NextResponse.json(
        { error: `lead insert failed: ${leadErr?.message ?? 'unknown'}` },
        { status: 500 }
      );
    }

    const { data: newConv, error: convErr } = await sb
      .from('conversations')
      .insert({
        lead_id: newLead.id,
        channel: 'web',
        external_id: sessionId,
        language
      })
      .select('id')
      .single();

    if (convErr || !newConv) {
      return NextResponse.json(
        { error: `conversation insert failed: ${convErr?.message ?? 'unknown'}` },
        { status: 500 }
      );
    }

    leadId = newLead.id;
    conversationId = newConv.id;
    isNewLead = true;
  }

  // 2. Persist the user message before anything that can fail.
  await sb.from('messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content: message
  });

  // 3. Fetch recent history for context (oldest first, excluding tool events).
  const { data: history } = await sb
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .neq('role', 'tool')
    .order('created_at', { ascending: false })
    .limit(HISTORY_TURNS * 2);

  const historyMessages: ChatMessage[] = (history ?? [])
    .reverse()
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, -1) // drop the just-inserted user message; we add it explicitly below
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as string
    }));

  // 4. RAG search.
  let reply = '';
  let usedFallback = false;
  let topScore = 0;
  let kbHits = 0;
  let modelUsed = '';
  let providerUsed: 'ollama' | 'openai' = env.LLM_PROVIDER;
  let promptName = 'system';

  try {
    const hits = await searchKB(message, language, { threshold: 0.35, limit: 5 });
    kbHits = hits.length;
    topScore = hits[0]?.similarity ?? 0;

    const threshold = env.LEADFLOW_RAG_SIMILARITY_THRESHOLD;
    const grounded = topScore >= threshold;

    let systemTemplate: string;
    if (grounded) {
      systemTemplate = loadPrompt('system', language);
    } else {
      systemTemplate = loadPrompt('fallback', language);
      usedFallback = true;
      promptName = 'fallback';
    }

    const context = grounded ? formatContext(hits.slice(0, 3)) : '';
    const system = fillTemplate(systemTemplate, {
      TENANT_NAME: env.LEADFLOW_TENANT_NAME,
      KB_CONTEXT: context,
      HISTORY: ''
    });

    const llmMessages: ChatMessage[] = [
      { role: 'system', content: system },
      ...historyMessages,
      { role: 'user', content: message }
    ];

    const result = await chat(llmMessages, { temperature: 0.3, maxTokens: 400 });
    reply = result.content.trim();
    modelUsed = result.model;
    providerUsed = result.provider;
  } catch (err) {
    console.error('[chat/message] AI pipeline failed', err);
    reply =
      language === 'fr'
        ? "Désolé, je rencontre un souci technique. Pouvez-vous réessayer dans un instant ?"
        : "Sorry, I'm having a technical hiccup. Please try again in a moment.";
    usedFallback = true;
    promptName = 'error';
  }

  // 5. Persist the assistant message.
  const tag = `${promptName}-${promptVersion()}-${providerUsed}-${modelUsed || 'na'}`;
  await sb.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: reply,
    prompt_version: tag
  });

  // 6. Qualification pass over the full transcript.
  //    Cheap, deterministic, and lets the admin dashboard surface signals
  //    without waiting for the post-conversation LLM summary in Sprint 6.
  const { data: fullTranscript } = await sb
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  const turns: TranscriptTurn[] = (fullTranscript ?? [])
    .filter((m): m is { role: 'user' | 'assistant' | 'system' | 'tool'; content: string } =>
      m.role === 'user' || m.role === 'assistant' || m.role === 'system' || m.role === 'tool'
    )
    .map((m) => ({ role: m.role, content: m.content }));

  const qualification = qualify(turns, language);
  const readiness = bookingReadiness(qualification, env.LEADFLOW_QUALIFICATION_THRESHOLD);

  // Persist lead-level signals so /admin reflects the latest score.
  const leadPatch: Record<string, unknown> = {
    qualification_score: qualification.score
  };
  if (qualification.contact.name) leadPatch.name = qualification.contact.name;
  if (qualification.contact.email) leadPatch.email = qualification.contact.email;
  if (qualification.contact.phone) leadPatch.phone = qualification.contact.phone;
  if (readiness.qualified) leadPatch.status = 'qualified';
  // Merge tags (don't overwrite the source tags from creation).
  const newTagSet = new Set<string>(qualification.tags);
  const { data: leadTagRow } = await sb
    .from('leads')
    .select('tags')
    .eq('id', leadId)
    .maybeSingle();
  for (const existingTag of leadTagRow?.tags ?? []) newTagSet.add(existingTag);
  leadPatch.tags = Array.from(newTagSet);
  await sb.from('leads').update(leadPatch).eq('id', leadId);

  // 7. Propose Cal.com slots if qualified + email available + Cal configured.
  let proposedSlots: AvailableSlot[] | null = null;
  let pendingBooking: {
    name: string | null;
    email: string;
    timezone: string;
  } | null = null;
  let bookingNote: string | null = null;

  if (readiness.qualified && readiness.canBook && isCalConfigured()) {
    try {
      const allSlots = await checkAvailability({ timeZone: timezone, limit: 30 });
      proposedSlots = pickProposedSlots(allSlots, 3);
      if (proposedSlots.length > 0) {
        pendingBooking = {
          name: qualification.contact.name,
          email: qualification.contact.email!, // guaranteed by readiness.canBook
          timezone
        };
        bookingNote =
          language === 'fr'
            ? 'Voici quelques créneaux disponibles. Choisissez-en un pour confirmer le rendez-vous.'
            : "Here are a few open slots. Pick one and I'll lock it in.";
      }
    } catch (err) {
      const msg = err instanceof CalComError ? err.message : (err as Error).message;
      console.error('[chat/message] checkAvailability failed', msg);
    }
  } else if (readiness.qualified && !readiness.canBook) {
    // Bot should ask for the missing detail on the next turn — surface a hint
    // so the widget knows we're in a "collecting contact" state if it wants
    // to render something useful later.
    bookingNote =
      language === 'fr'
        ? 'Pour réserver, partagez votre email.'
        : 'To book, please share your email.';
  }

  // 8. Fire-and-forget CRM sync to n8n for downstream integrations.
  if (isNewLead) {
    callN8n('/leadflow/crm-sync', {
      event: 'lead.created',
      lead: { id: leadId, source: 'web', language, status: 'new' },
      conversation: { id: conversationId, channel: 'web' },
      correlation_id: sessionId,
      timestamp: new Date().toISOString()
    }).catch((err) => console.error('[chat/message] crm-sync failed', err));
  }
  if (readiness.qualified) {
    callN8n('/leadflow/crm-sync', {
      event: 'lead.qualified',
      lead: {
        id: leadId,
        source: 'web',
        language,
        status: 'qualified',
        qualification_score: qualification.score,
        signals: qualification.signals,
        contact: qualification.contact
      },
      conversation: { id: conversationId, channel: 'web' },
      correlation_id: sessionId,
      timestamp: new Date().toISOString()
    }).catch((err) => console.error('[chat/message] qualified sync failed', err));
  }

  return NextResponse.json({
    session_id: sessionId,
    reply,
    language,
    lead_id: leadId,
    conversation_id: conversationId,
    is_new_lead: isNewLead,
    prompt_version: tag,
    rag: {
      hits: kbHits,
      top_score: Number(topScore.toFixed(3)),
      used_fallback: usedFallback
    },
    qualification: {
      score: qualification.score,
      qualified: readiness.qualified,
      intent: qualification.signals.intent,
      tags: qualification.tags
    },
    booking: {
      pending: pendingBooking,
      proposed_slots: proposedSlots,
      note: bookingNote,
      missing: readiness.missing
    }
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
