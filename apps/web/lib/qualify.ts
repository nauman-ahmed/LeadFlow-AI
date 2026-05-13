// Heuristic lead qualification for the chat path.
//
// Why heuristic, not LLM-based JSON: at MVP we want a deterministic, cheap,
// inspectable score we can show in the admin dashboard. The LLM is responsible
// for *conversation*; this module is responsible for *signals*. Sprint 6 will
// add an LLM-backed `summaries.qualification_json` for richer reporting.
//
// Score range: 0–100. Threshold defaults to 60 (env LEADFLOW_QUALIFICATION_THRESHOLD).

import type { Language } from './types';

export interface TranscriptTurn {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
}

export interface ContactExtract {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface QualificationResult {
  score: number;
  signals: {
    has_email: boolean;
    has_name: boolean;
    intent: 'demo' | 'pricing' | 'support' | 'integration' | 'general';
    use_case_mentioned: boolean;
    team_size_mentioned: boolean;
    urgency_mentioned: boolean;
    turn_count: number;
  };
  contact: ContactExtract;
  /** A short list of explanation tags for the admin UI. */
  tags: string[];
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s.\-()]{7,}\d)/;

// Keyword buckets per language. Intentionally small + obvious; we tune as we go.
const KEYWORDS: Record<
  Language,
  Record<'demo' | 'pricing' | 'integration' | 'support' | 'useCase' | 'teamSize' | 'urgency' | 'nameHint', string[]>
> = {
  en: {
    demo: ['demo', 'book', 'schedule', 'meeting', 'call', 'talk to sales', 'introductory'],
    pricing: ['price', 'pricing', 'cost', 'quote', 'plan', 'subscription'],
    integration: ['integrate', 'integration', 'api', 'webhook', 'hubspot', 'salesforce', 'crm'],
    support: ['issue', 'bug', 'broken', 'not working', 'help', 'support'],
    useCase: ['use case', 'workflow', 'we want', 'our team', 'our company', 'we need', 'help us'],
    teamSize: ['users', 'seats', 'people', 'team of', 'employees', 'agents'],
    urgency: ['urgent', 'asap', 'this week', 'today', 'tomorrow', 'soon', 'deadline'],
    nameHint: ['my name is', "i'm ", 'i am ', 'this is ']
  },
  fr: {
    demo: ['démo', 'demo', 'réserver', 'rendez-vous', 'rdv', 'rencontre', 'appel'],
    pricing: ['prix', 'tarif', 'tarifs', 'devis', 'coût', 'abonnement', 'forfait'],
    integration: ['intégration', 'intégrer', 'api', 'webhook', 'crm', 'hubspot', 'salesforce'],
    support: ['problème', 'bug', 'cassé', 'aide', 'support', 'ne fonctionne pas'],
    useCase: ['cas d’usage', "cas d'usage", 'notre équipe', 'notre entreprise', 'nous voulons', 'nous avons besoin'],
    teamSize: ['utilisateurs', 'sièges', 'personnes', 'équipe de', 'employés', 'agents'],
    urgency: ['urgent', 'urgence', 'cette semaine', 'demain', 'aujourd’hui', "aujourd'hui", 'bientôt'],
    nameHint: ['je m’appelle', "je m'appelle", 'je suis ', "c'est ", 'c’est ']
  }
};

function hits(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n));
}

export function extractContact(turns: TranscriptTurn[]): ContactExtract {
  let email: string | null = null;
  let phone: string | null = null;
  let name: string | null = null;

  for (const turn of turns) {
    if (turn.role !== 'user' || !turn.content) continue;
    const content = turn.content;

    if (!email) {
      const m = content.match(EMAIL_RE);
      if (m) email = m[0];
    }
    if (!phone) {
      const m = content.match(PHONE_RE);
      // Cheap guard: real phone is at least 8 digits.
      if (m && (m[0].match(/\d/g) ?? []).length >= 8) phone = m[0].trim();
    }
    if (!name) {
      const lower = content.toLowerCase();
      for (const lang of ['en', 'fr'] as const) {
        for (const hint of KEYWORDS[lang].nameHint) {
          const i = lower.indexOf(hint);
          if (i >= 0) {
            const after = content.slice(i + hint.length).trim();
            // Take 1–3 capitalized words as the name.
            const m = after.match(/^([A-ZÀ-Ý][\p{L}'-]+(?:\s+[A-ZÀ-Ý][\p{L}'-]+){0,2})/u);
            if (m) {
              name = m[1].trim();
              break;
            }
          }
        }
        if (name) break;
      }
    }
  }

  return { name, email, phone };
}

export function qualify(turns: TranscriptTurn[], language: Language = 'en'): QualificationResult {
  const userText = turns
    .filter((t) => t.role === 'user' && t.content)
    .map((t) => t.content)
    .join('\n');

  const contact = extractContact(turns);
  const kw = KEYWORDS[language];

  const hasEmail = Boolean(contact.email);
  const hasName = Boolean(contact.name);
  const turnCount = turns.filter((t) => t.role === 'user').length;
  const useCaseMentioned = hits(userText, kw.useCase);
  const teamSizeMentioned = hits(userText, kw.teamSize);
  const urgencyMentioned = hits(userText, kw.urgency);

  let intent: QualificationResult['signals']['intent'] = 'general';
  if (hits(userText, kw.demo)) intent = 'demo';
  else if (hits(userText, kw.pricing)) intent = 'pricing';
  else if (hits(userText, kw.integration)) intent = 'integration';
  else if (hits(userText, kw.support)) intent = 'support';

  const tags: string[] = [`intent:${intent}`];
  let score = 0;

  if (hasEmail) { score += 35; tags.push('has:email'); }
  if (hasName) { score += 10; tags.push('has:name'); }
  if (intent === 'demo') { score += 20; tags.push('signal:demo-intent'); }
  if (intent === 'pricing') { score += 15; tags.push('signal:pricing-intent'); }
  if (intent === 'integration') { score += 10; tags.push('signal:integration'); }
  if (useCaseMentioned) { score += 10; tags.push('signal:use-case'); }
  if (teamSizeMentioned) { score += 10; tags.push('signal:team-size'); }
  if (urgencyMentioned) { score += 10; tags.push('signal:urgency'); }
  // Engagement bonus: meaningful back-and-forth.
  if (turnCount >= 3) { score += 5; tags.push('signal:engaged'); }

  // Penalize pure-support intent (those are handoff candidates, not bookings).
  if (intent === 'support') { score = Math.max(0, score - 15); tags.push('penalty:support-only'); }

  if (score > 100) score = 100;

  return {
    score,
    signals: {
      has_email: hasEmail,
      has_name: hasName,
      intent,
      use_case_mentioned: useCaseMentioned,
      team_size_mentioned: teamSizeMentioned,
      urgency_mentioned: urgencyMentioned,
      turn_count: turnCount
    },
    contact,
    tags
  };
}

export interface BookingReadiness {
  /** Score is high enough to propose slots. */
  qualified: boolean;
  /** We have the bare minimum (email) to actually create the booking. */
  canBook: boolean;
  /** What's still missing, for the bot to ask for next. */
  missing: Array<'name' | 'email'>;
}

export function bookingReadiness(result: QualificationResult, threshold: number): BookingReadiness {
  const qualified = result.score >= threshold;
  const missing: Array<'name' | 'email'> = [];
  if (!result.contact.name) missing.push('name');
  if (!result.contact.email) missing.push('email');
  const canBook = result.contact.email !== null; // email is the hard requirement
  return { qualified, canBook, missing };
}
