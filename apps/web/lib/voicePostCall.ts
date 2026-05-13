import type { SupabaseClient } from '@supabase/supabase-js';
import { chat } from '@/lib/llm';
import { env } from '@/lib/env';
import { promptVersion } from '@/lib/prompts';

function pickRecordingUrl(rec: Record<string, unknown> | null | undefined): string | null {
  if (!rec) return null;
  const candidates = ['stereoUrl', 'monoUrl', 'url', 'recordingUrl', 'downloadUrl'];
  for (const k of candidates) {
    const v = rec[k];
    if (typeof v === 'string' && v.startsWith('http')) return v;
  }
  return null;
}

function recordingUrlFromArtifact(artifact: Record<string, unknown> | undefined): string | null {
  const r = artifact?.recording;
  if (typeof r === 'string' && r.startsWith('http')) return r;
  if (r && typeof r === 'object') return pickRecordingUrl(r as Record<string, unknown>);
  return null;
}

function transcriptFromArtifact(artifact: Record<string, unknown> | undefined): string {
  const t = artifact?.transcript;
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) {
    return t
      .map((row) => {
        if (!row || typeof row !== 'object') return '';
        const r = row as Record<string, unknown>;
        const role = String(r.role ?? 'speaker');
        const msg = String(r.message ?? r.content ?? '');
        return msg ? `${role}: ${msg}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * Persists transcript artifact, recording metadata, and an LLM summary after a Vapi call ends.
 */
export async function handleVoiceEndOfCallReport(
  sb: SupabaseClient,
  message: Record<string, unknown>
): Promise<void> {
  const call = message.call as Record<string, unknown> | undefined;
  const callId = call && typeof call.id === 'string' ? call.id : '';
  if (!callId) {
    console.warn('[voicePostCall] end-of-call-report without call.id');
    return;
  }

  const { data: conv, error: convErr } = await sb
    .from('conversations')
    .select('id, lead_id, language')
    .eq('external_id', callId)
    .maybeSingle();

  if (convErr || !conv) {
    console.warn('[voicePostCall] no conversation for call', callId);
    return;
  }

  const artifact = message.artifact as Record<string, unknown> | undefined;
  let transcript = transcriptFromArtifact(artifact);
  if (!transcript.trim() && typeof message.transcript === 'string') {
    transcript = message.transcript;
  }

  const recordingUrl = recordingUrlFromArtifact(artifact);
  const recordingObj =
    artifact?.recording && typeof artifact.recording === 'object'
      ? (artifact.recording as Record<string, unknown>)
      : undefined;
  const durationRaw =
    (call?.durationSeconds as number | undefined) ??
    (recordingObj?.duration as number | undefined) ??
    (artifact?.durationSeconds as number | undefined);
  const durationSec =
    typeof durationRaw === 'number' && Number.isFinite(durationRaw)
      ? Math.round(durationRaw)
      : null;

  const endedAt = new Date().toISOString();
  await sb.from('conversations').update({ ended_at: endedAt }).eq('id', conv.id);

  if (transcript.trim()) {
    await sb.from('messages').insert({
      conversation_id: conv.id,
      role: 'system',
      content: `Voice call transcript:\n${transcript.trim()}`,
      prompt_version: `voice-transcript-${promptVersion()}`
    });
  }

  if (recordingUrl || durationSec !== null) {
    await sb.from('call_recordings').insert({
      conversation_id: conv.id,
      provider: 'vapi',
      recording_url: recordingUrl,
      transcript_url: null,
      duration_sec: durationSec
    });
  }

  const lang = conv.language === 'fr' ? 'fr' : 'en';
  const summaryInput = transcript.trim() || '(no transcript captured)';
  let summaryText = '';
  let modelUsed = '';
  try {
    const system =
      lang === 'fr'
        ? `Tu résumes un appel commercial pour ${env.LEADFLOW_TENANT_NAME}. En 5 phrases max: intention, objections, données de contact mentionnées, prochaine étape. JSON optionnel en fin: {"intent":"","next_step":""}.`
        : `Summarize this sales call for ${env.LEADFLOW_TENANT_NAME}. At most 5 sentences: intent, objections, any contact details mentioned, next step. Optionally end with JSON: {"intent":"","next_step":""}.`;

    const res = await chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: summaryInput }
      ],
      { temperature: 0.2, maxTokens: 400, timeoutMs: 45_000 }
    );
    summaryText = res.content.trim();
    modelUsed = `${res.provider}:${res.model}`;
  } catch (err) {
    console.error('[voicePostCall] summary LLM failed', err);
    summaryText =
      lang === 'fr'
        ? "Résumé indisponible (erreur LLM). Voir le transcript brut ci-dessus."
        : 'Summary unavailable (LLM error). See raw transcript above.';
    modelUsed = 'error';
  }

  await sb.from('summaries').insert({
    conversation_id: conv.id,
    text: summaryText,
    text_en: lang === 'fr' ? null : summaryText,
    qualification_json: null,
    model: modelUsed,
    prompt_version: `voice-eoc-${promptVersion()}`
  });
}
