import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// Generic event endpoint for non-message interactions: button clicks, language
// switches, handoff requests, thumbs feedback. Sprint 6 wires real handoff side
// effects; for Sprint 1 we just persist what we can use later.

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionId: string = body.session_id;
  const event: string = body.event;
  const payload = body.payload ?? {};

  if (!sessionId || !event) {
    return NextResponse.json({ error: 'session_id and event required' }, { status: 400 });
  }

  const sb = createServerClient();

  const { data: conv } = await sb
    .from('conversations')
    .select('id, lead_id')
    .eq('external_id', sessionId)
    .maybeSingle();

  if (!conv) {
    // Event fired before any message — accept and ignore for now.
    return NextResponse.json({ ok: true, persisted: false });
  }

  // Persist as a 'tool' role message so it shows in the transcript.
  await sb.from('messages').insert({
    conversation_id: conv.id,
    role: 'tool',
    content: JSON.stringify({ event, payload })
  });

  if (event === 'handoff_request') {
    await sb.from('conversations').update({ handoff: true }).eq('id', conv.id);
    await sb.from('leads').update({ status: 'handoff' }).eq('id', conv.lead_id);
  }

  return NextResponse.json({ ok: true, persisted: true });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
