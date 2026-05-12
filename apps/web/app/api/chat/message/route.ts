import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { callN8n } from '@/lib/n8n';
import type { Language } from '@/lib/types';

interface N8nReply {
  reply?: string;
  prompt_version?: string;
  language?: Language;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionId: string = body.session_id;
  const message: string = String(body.message ?? '').slice(0, 4000);
  const language: Language = body.language === 'fr' ? 'fr' : 'en';

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

  // 2. Persist the user message.
  await sb.from('messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content: message
  });

  // 3. Ask n8n for the reply (stub today; RAG/LLM in Sprint 2).
  let reply = '(no reply)';
  let promptVersion: string | undefined;

  try {
    const n8nRes = await callN8n<N8nReply>('/leadflow/chat-turn', {
      session_id: sessionId,
      message,
      language,
      lead_id: leadId,
      conversation_id: conversationId
    });
    reply = n8nRes?.reply ?? reply;
    promptVersion = n8nRes?.prompt_version;
  } catch (err) {
    reply =
      language === 'fr'
        ? "Désolé, je rencontre un souci technique. Pouvez-vous réessayer ?"
        : "Sorry, I'm having a technical hiccup. Please try again.";
    console.error('[chat/message] n8n call failed', err);
  }

  // 4. Persist the assistant message.
  await sb.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: reply,
    prompt_version: promptVersion ?? null
  });

  // 5. Fire-and-forget CRM event on new lead.
  if (isNewLead) {
    callN8n('/leadflow/crm-sync', {
      event: 'lead.created',
      lead: { id: leadId, source: 'web', language, status: 'new' },
      conversation: { id: conversationId, channel: 'web' },
      correlation_id: sessionId,
      timestamp: new Date().toISOString()
    }).catch((err) => console.error('[chat/message] crm-sync failed', err));
  }

  return NextResponse.json({
    session_id: sessionId,
    reply,
    language,
    lead_id: leadId,
    conversation_id: conversationId,
    is_new_lead: isNewLead,
    prompt_version: promptVersion
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
