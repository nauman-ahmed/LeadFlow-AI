import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { callN8n } from '@/lib/n8n';
import { searchKB, formatContext } from '@/lib/rag';
import {
  checkAvailability,
  pickProposedSlots,
  isCalConfigured,
  defaultTimeZone,
  CalComError
} from '@/lib/calcom';
import { confirmIntroCalBooking } from '@/lib/confirmIntroCalBooking';
import { promptVersion } from '@/lib/prompts';
import type { Language } from '@/lib/types';
import { ensureVoiceConversation, type VoiceConversationContext } from '@/lib/voiceSession';
import { normalizeVoiceTimeZone } from '@/lib/ianaTimeZone';

export interface VapiToolResult {
  toolCallId: string;
  name?: string;
  result?: string;
  error?: string;
}

export function vapiOneLine(s: string, max = 2000): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Map dashboard names like `Check Availability` / `checkAvailability` → `check_availability`. */
export function canonicalToolName(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * Vapi `ToolCall` uses OpenAI shape: `function.name` + `function.arguments` as a **JSON string**.
 * Alternate payloads may send objects on `arguments` / `parameters`.
 */
function parseVapiToolArguments(
  fnBlock: Record<string, unknown> | undefined,
  fallback: Record<string, unknown> | undefined
): Record<string, unknown> {
  const raw =
    fnBlock?.arguments ??
    fnBlock?.parameters ??
    fallback?.arguments ??
    fallback?.parameters;

  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return {};
    try {
      const parsed = JSON.parse(s) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function vapiCallSessionId(message: Record<string, unknown>): string {
  const c = message.call as Record<string, unknown> | undefined;
  if (!c || c.id == null) return '';
  return String(c.id).trim();
}

/** First non-empty candidate; if `sessionCallId` is set, prefer a candidate that is not the session id when possible. */
function pickToolCallIdPreferringNonSession(
  sessionCallId: string,
  ...candidates: (unknown | undefined)[]
): string {
  const seq = candidates
    .map((c) => (c == null ? '' : String(c).trim()))
    .filter(Boolean);
  if (!seq.length) return '';
  if (!sessionCallId) return seq[0]!;
  const distinct = seq.find((s) => s !== sessionCallId);
  return distinct ?? seq[0]!;
}

export function collectToolCalls(message: Record<string, unknown>): {
  id: string;
  name: string;
  args: Record<string, unknown>;
}[] {
  const out: { id: string; name: string; args: Record<string, unknown> }[] = [];
  const sessionId = vapiCallSessionId(message);

  const list = message.toolCallList;
  if (Array.isArray(list)) {
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const t = raw as Record<string, unknown>;
      const nestedTc = t.toolCall as Record<string, unknown> | undefined;
      const id = pickToolCallIdPreferringNonSession(
        sessionId,
        t.toolCallId,
        nestedTc?.toolCallId,
        nestedTc?.id,
        t.id
      );
      const fn = (nestedTc?.function as Record<string, unknown> | undefined) ?? (t.function as Record<string, unknown> | undefined);
      const name = String(fn?.name ?? nestedTc?.name ?? t.name ?? '').trim();
      const args = parseVapiToolArguments(fn, nestedTc ?? t);
      if (id && name) out.push({ id, name, args });
    }
  }

  const withList = message.toolWithToolCallList as unknown[] | undefined;
  if (Array.isArray(withList)) {
    for (const raw of withList) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;
      const tc = row.toolCall as Record<string, unknown> | undefined;
      if (tc) {
        const id = pickToolCallIdPreferringNonSession(sessionId, tc.toolCallId, tc.id, row.toolCallId);
        const fn = tc.function as Record<string, unknown> | undefined;
        const name = String(fn?.name ?? row.name ?? '').trim();
        const args = parseVapiToolArguments(fn, tc);
        if (id && name) out.push({ id, name, args });
      } else {
        const id = pickToolCallIdPreferringNonSession(sessionId, row.toolCallId);
        const fn = row.function as Record<string, unknown> | undefined;
        const name = String(fn?.name ?? row.name ?? '').trim();
        const args = parseVapiToolArguments(fn, row);
        if (id && name) out.push({ id, name, args });
      }
    }
  }

  const seen = new Set<string>();
  return out.filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

/** Ids only — used when the payload shape is unexpected but Vapi still needs matching toolCallIds. */
export function extractToolCallIds(message: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const sessionId = vapiCallSessionId(message);

  const list = message.toolCallList;
  if (Array.isArray(list)) {
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const t = raw as Record<string, unknown>;
      const nestedTc = t.toolCall as Record<string, unknown> | undefined;
      const id = pickToolCallIdPreferringNonSession(
        sessionId,
        t.toolCallId,
        nestedTc?.toolCallId,
        nestedTc?.id,
        t.id
      );
      if (id) ids.push(id);
    }
  }
  const withList = message.toolWithToolCallList as unknown[] | undefined;
  if (Array.isArray(withList)) {
    for (const raw of withList) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;
      const tc = row.toolCall as Record<string, unknown> | undefined;
      if (tc) {
        const id = pickToolCallIdPreferringNonSession(sessionId, tc.toolCallId, tc.id, row.toolCallId);
        if (id) ids.push(id);
      } else {
        const id = pickToolCallIdPreferringNonSession(sessionId, row.toolCallId);
        if (id) ids.push(id);
      }
    }
  }
  return [...new Set(ids)];
}

function callLanguage(call: Record<string, unknown> | undefined, fallback: Language): Language {
  const meta = call?.metadata as Record<string, unknown> | undefined;
  const raw = meta?.language ?? meta?.lang;
  return raw === 'fr' ? 'fr' : fallback;
}

async function runOneTool(
  sb: SupabaseClient,
  ctx: VoiceConversationContext,
  tool: { id: string; name: string; args: Record<string, unknown> }
): Promise<VapiToolResult> {
  const { id: toolCallId, name: rawName, args } = tool;
  const canon = canonicalToolName(rawName);

  try {
    switch (canon) {
      case 'capture_lead': {
        const patch: Record<string, unknown> = {};
        if (typeof args.name === 'string' && args.name.trim()) patch.name = args.name.trim();
        if (typeof args.email === 'string' && args.email.trim()) patch.email = args.email.trim();
        if (typeof args.phone === 'string' && args.phone.trim()) patch.phone = args.phone.trim();
        if (typeof args.company === 'string' && args.company.trim()) {
          const { data: lead } = await sb.from('leads').select('tags').eq('id', ctx.leadId).maybeSingle();
          const tags = new Set<string>([...(lead?.tags ?? []), `company:${args.company.trim()}`]);
          patch.tags = Array.from(tags);
        }
        if (Object.keys(patch).length > 0) {
          await sb.from('leads').update(patch).eq('id', ctx.leadId);
        }
        await sb.from('messages').insert({
          conversation_id: ctx.conversationId,
          role: 'tool',
          content: vapiOneLine(JSON.stringify({ tool: canon, args })),
          prompt_version: `voice-tool-${promptVersion()}`
        });
        return {
          toolCallId,
          name: rawName,
          result: vapiOneLine(JSON.stringify({ ok: true, updated: Object.keys(patch) }))
        };
      }
      case 'search_kb': {
        const query = typeof args.query === 'string' ? args.query : '';
        if (!query.trim()) {
          return { toolCallId, name: rawName, error: vapiOneLine('query parameter required') };
        }
        const hits = await searchKB(query, ctx.language, { threshold: 0.35, limit: 5 });
        const text =
          hits.length > 0
            ? formatContext(hits.slice(0, 3))
            : ctx.language === 'fr'
              ? 'Aucun extrait pertinent trouvé dans la base de connaissances.'
              : 'No relevant knowledge base excerpts found.';
        return { toolCallId, name: rawName, result: vapiOneLine(text, 2400) };
      }
      case 'check_availability': {
        if (!isCalConfigured()) {
          return {
            toolCallId,
            name: rawName,
            error: vapiOneLine('Calendar booking is not configured for this demo environment.')
          };
        }
        const rawTz =
          typeof args.timezone === 'string' && args.timezone.trim()
            ? args.timezone.trim()
            : defaultTimeZone();
        const tz = normalizeVoiceTimeZone(rawTz);
        const slots = await checkAvailability({ timeZone: tz, limit: 24 });
        const picked = pickProposedSlots(slots, 5);
        const payload: Record<string, unknown> = {
          timezone: tz,
          slots: picked,
          ...(rawTz !== tz ? { normalized_from: rawTz } : {})
        };
        if (picked.length === 0) {
          payload.hint =
            'No slots returned. Use an IANA timezone with a slash (e.g. Europe/Berlin), not a space.';
        }
        return {
          toolCallId,
          name: rawName,
          result: vapiOneLine(JSON.stringify(payload))
        };
      }
      case 'create_booking': {
        const start = typeof args.start === 'string' ? args.start : '';
        const email = typeof args.email === 'string' ? args.email : '';
        const nameArg = typeof args.name === 'string' ? args.name : undefined;
        const timezone = normalizeVoiceTimeZone(
          typeof args.timezone === 'string' && args.timezone.trim()
            ? args.timezone.trim()
            : defaultTimeZone()
        );
        if (!start || !email || !/.+@.+\..+/.test(email)) {
          return {
            toolCallId,
            name: rawName,
            error: vapiOneLine('start (UTC ISO) and valid email are required')
          };
        }
        const booked = await confirmIntroCalBooking(sb, {
          externalId: ctx.callId,
          start,
          email,
          name: nameArg,
          timezone,
          language: ctx.language,
          channel: 'voice'
        });
        if (!booked.ok) {
          return { toolCallId, name: rawName, error: vapiOneLine(booked.message) };
        }
        return {
          toolCallId,
          name: rawName,
          result: vapiOneLine(
            JSON.stringify({
              ok: true,
              confirmation: booked.confirmation,
              appointment: booked.appointment
            })
          )
        };
      }
      case 'request_handoff': {
        const reason = typeof args.reason === 'string' ? args.reason : 'unspecified';
        await sb
          .from('conversations')
          .update({ handoff: true, ended_at: new Date().toISOString() })
          .eq('id', ctx.conversationId);
        await sb
          .from('leads')
          .update({ status: 'handoff' })
          .eq('id', ctx.leadId);
        await sb.from('messages').insert({
          conversation_id: ctx.conversationId,
          role: 'tool',
          content: vapiOneLine(JSON.stringify({ tool: canon, reason })),
          prompt_version: `voice-handoff-${promptVersion()}`
        });
        callN8n('/leadflow/crm-sync', {
          event: 'lead.handoff',
          lead: { id: ctx.leadId, source: 'voice', language: ctx.language, status: 'handoff' },
          conversation: { id: ctx.conversationId, channel: 'voice' },
          reason,
          correlation_id: ctx.callId,
          timestamp: new Date().toISOString()
        }).catch((err) => console.error('[voice] handoff crm-sync failed', err));

        return {
          toolCallId,
          name: rawName,
          result: vapiOneLine(
            ctx.language === 'fr'
              ? "J'ai signalé qu'un humain doit reprendre la conversation."
              : 'I have flagged this conversation for a human teammate to follow up.'
          )
        };
      }
      default:
        return {
          toolCallId,
          name: rawName,
          error: vapiOneLine(`unknown tool: ${rawName} (canonical: ${canon})`)
        };
    }
  } catch (err) {
    const msg = err instanceof CalComError ? err.message : (err as Error).message;
    console.error('[voiceToolExecutor]', canon, msg);
    return { toolCallId, name: rawName, error: vapiOneLine(msg) };
  }
}

export async function executeVoiceToolCalls(
  sb: SupabaseClient,
  message: Record<string, unknown>
): Promise<{ results: VapiToolResult[] }> {
  const call = message.call as Record<string, unknown> | undefined;
  const callIdRaw = call?.id;
  const callId = callIdRaw != null && String(callIdRaw).trim() !== '' ? String(callIdRaw).trim() : '';
  if (!callId) {
    const ids = extractToolCallIds(message);
    if (ids.length > 0) {
      return {
        results: ids.map((toolCallId) => ({
          toolCallId,
          error: vapiOneLine('missing call.id on tool-calls message')
        }))
      };
    }
    return { results: [{ toolCallId: 'unknown', error: vapiOneLine('missing call.id on tool-calls message') }] };
  }

  const language = callLanguage(call, env.LEADFLOW_DEFAULT_LANGUAGE);
  const ctx = await ensureVoiceConversation(sb, callId, language);

  const tools = collectToolCalls(message);
  if (tools.length === 0) {
    const ids = extractToolCallIds(message);
    if (ids.length > 0) {
      return {
        results: ids.map((toolCallId) => ({
          toolCallId,
          error: vapiOneLine(
            'Could not parse tool name/arguments from this Vapi payload. Check toolCallList / toolWithToolCallList shape.'
          )
        }))
      };
    }
    return { results: [{ toolCallId: 'unknown', error: vapiOneLine('no tool calls in payload') }] };
  }

  const results: VapiToolResult[] = [];
  for (const t of tools) {
    results.push(await runOneTool(sb, ctx, t));
  }
  return { results };
}
