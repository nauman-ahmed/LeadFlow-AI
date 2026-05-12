import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import type { Language } from '@/lib/types';

const greetings: Record<Language, string> = {
  en: "Hi! I'm LeadFlow. How can I help today?",
  fr: "Bonjour ! Je suis LeadFlow. Comment puis-je vous aider aujourd'hui ?"
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const language: Language = body.language === 'fr' ? 'fr' : env.LEADFLOW_DEFAULT_LANGUAGE;

  return NextResponse.json({
    session_id: randomUUID(),
    language,
    greeting: greetings[language],
    tenant_name: env.LEADFLOW_TENANT_NAME
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
