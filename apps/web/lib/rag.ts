import { createServerClient } from './supabase';
import { embed } from './llm';

export interface KBHit {
  chunk_id: string;
  document_id: string;
  title: string;
  language: string;
  content: string;
  similarity: number;
}

export async function searchKB(
  query: string,
  language: 'en' | 'fr',
  opts: { threshold?: number; limit?: number } = {}
): Promise<KBHit[]> {
  const { vector } = await embed(query);
  const sb = createServerClient();

  const { data, error } = await sb.rpc('kb_search', {
    query_embedding: vector,
    match_language: language,
    match_threshold: opts.threshold ?? 0.40,
    match_count: opts.limit ?? 5
  });

  if (error) {
    throw new Error(`kb_search: ${error.message}`);
  }

  return (data ?? []) as KBHit[];
}

export function formatContext(hits: KBHit[]): string {
  return hits
    .map((h) => `## ${h.title}\n${h.content}`)
    .join('\n\n---\n\n');
}
