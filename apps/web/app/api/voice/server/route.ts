import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { assertVoiceServerAuthorized, VoiceWebhookAuthError } from '@/lib/voiceWebhookAuth';
import { collectToolCalls, executeVoiceToolCalls, vapiOneLine } from '@/lib/voiceToolExecutor';
import { handleVoiceEndOfCallReport } from '@/lib/voicePostCall';

/** 
 * Vapi assistant **server URL** target (also reachable via n8n `vapi-server-proxy`).
 *
 * Handles:
 * - `tool-calls` → Supabase + Cal.com + KB (returns Vapi `results` shape)
 * - `end-of-call-report` → transcript, `call_recordings`, `summaries`
 *
 * Auth: `x-leadflow-secret`, `X-Vapi-Secret`, or `Authorization: Bearer …` must match
 * `VAPI_WEBHOOK_SECRET`, or if that is unset, `N8N_WEBHOOK_SECRET`.
 */
export async function POST(req: Request) {
  try {
    assertVoiceServerAuthorized(req);
  } catch (e) {
    if (e instanceof VoiceWebhookAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const body = (await req.json().catch(() => ({}))) as { message?: unknown };
  const message = body.message;
  if (!message || typeof message !== 'object') {
    return NextResponse.json({}, { status: 200 });
  }

  const msg = message as Record<string, unknown>;
  const type = String(msg.type ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');

  // `function-call` appears in some Vapi server message lists alongside `tool-calls`; treat the same.
  if (type === 'tool-calls' || type === 'function-call') {
    try {
      console.log('Executing tool calls', msg);
      const sb = createServerClient();
      const { results } = await executeVoiceToolCalls(sb, msg);
      // `result` / `error` must be single-line strings. Optional `name` matches Vapi's own examples.
      const resultsOut = results.map((r) => {
        const piece =
          r.error != null && r.error !== ''
            ? { toolCallId: r.toolCallId, error: String(r.error) }
            : { toolCallId: r.toolCallId, result: String(r.result ?? '') };
        return r.name ? { ...piece, name: r.name } : piece;
      });
      if (process.env.NODE_ENV !== 'production') {
        console.info(
          '[voice/server] tool-calls response',
          JSON.stringify({ count: resultsOut.length, resultsOut })
        );
      }
      return NextResponse.json({ results: resultsOut }, { status: 200 });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'internal error';
      console.error('[voice/server] tool-calls', e);
      const calls = collectToolCalls(msg);
      const toolCallId = calls[0]?.id || 'unknown';
      return NextResponse.json(
        { results: [{ toolCallId, error: vapiOneLine(errMsg, 500) }] },
        { status: 200 }
      );
    }
  }

  if (type === 'end-of-call-report') {
    const sb = createServerClient();
    await handleVoiceEndOfCallReport(sb, msg);
    return NextResponse.json({}, { status: 200 });
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info('[voice/server] 200 empty body (no handler for message.type):', type || '(missing)');
  }

  return NextResponse.json({}, { status: 200 });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
