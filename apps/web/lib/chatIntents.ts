import type { Language } from './types';

// Small, deterministic checks that run before the LLM on the chat path.

const FR_WORDS = new Set([
  'bonjour', 'merci', 'je', 'vous', 'nous', 'est', 'sont', 'les', 'des', 'une', 'du', 'au', 'aux',
  'quel', 'quels', 'quelle', 'quelles', 'combien', 'comment', 'pourquoi', 'pour', 'avec', 'sans',
  'votre', 'vos', 'notre', 'nos', 'mon', 'ma', 'mes', 'cest', 'coute', 'forfait', 'equipe',
  'oui', 'non', 'mais', 'aussi', 'tres', 'peut', 'pouvez', 'voudrais', 'souhaite', 'parler'
]);
const EN_WORDS = new Set([
  'the', 'is', 'are', 'you', 'your', 'we', 'our', 'what', 'how', 'much', 'many', 'does', 'do',
  'can', 'could', 'would', 'with', 'for', 'and', 'this', 'that', 'have', 'has', 'cost', 'package',
  'team', 'hello', 'hi', 'thanks', 'please', 'want', 'need', 'talk', 'speak', 'it', 'my'
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents: coûte -> coute
    .replace(/[’']/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * Language the visitor is actually writing in. Switches only on a clear signal
 * (at least two marker words and more than the other language), so short
 * replies like an email address or "ok" keep the current language.
 */
export function detectLanguage(message: string, current: Language): Language {
  let fr = 0;
  let en = 0;
  for (const w of words(message)) {
    if (FR_WORDS.has(w)) fr++;
    if (EN_WORDS.has(w)) en++;
  }
  if (fr >= 2 && fr > en) return 'fr';
  if (en >= 2 && en > fr) return 'en';
  return current;
}

const HANDOFF_PATTERNS: RegExp[] = [
  /\b(real|actual|live)\s+(person|human|people)\b/i,
  /\b(talk|speak|chat)\s+(to|with)\s+(a|an|some|someone|somebody|your|the)?\s*(human|person|agent|representative|rep|operator|teammate|sales\s*person|someone|somebody)\b/i,
  /\b(human|operator|representative)\s+(please|now)\b/i,
  /\bconnect\s+me\s+(to|with)\b/i,
  // French: "une vraie personne", "un humain", "un conseiller" (not the verb "conseiller").
  /\bune?\s+(vraie?\s+personne|(ê|e)tre\s+humain|humain|conseill(er|ère|ere)|op(é|e)rat(eur|rice))/i,
  /\bparler\s+(à|a|avec)\s+(quelqu['’]un|un\s+(humain|commercial|agent|conseiller))/i
];

/** True when the visitor asks for a person rather than the assistant. */
export function isHandoffRequest(message: string): boolean {
  return HANDOFF_PATTERNS.some((re) => re.test(message));
}

/**
 * Honest reply for a handoff: nobody joins the chat live, a teammate follows
 * up. Asks for an email when we have no way to reach the visitor.
 */
export function handoffReply(language: Language, email: string | null): string {
  if (language === 'fr') {
    return email
      ? `J'ai transmis votre demande à un membre de l'équipe, qui vous répondra à ${email}. Personne ne peut rejoindre ce chat en direct pour le moment.`
      : "J'ai transmis votre demande à un membre de l'équipe. Personne ne peut rejoindre ce chat en direct pour le moment. À quelle adresse email pouvons-nous vous répondre ?";
  }
  return email
    ? `I've passed this to a teammate, who will get back to you at ${email}. Nobody can join this chat live right now.`
    : "I've passed this to a teammate, who will get back to you. Nobody can join this chat live right now. What's the best email to reach you?";
}

/** Confirmation once a visitor who asked for a person shares their email. */
export function handoffEmailReply(language: Language, email: string): string {
  return language === 'fr'
    ? `Merci ! Un membre de l'équipe vous écrira à ${email}.`
    : `Thanks! A teammate will email you at ${email}.`;
}
