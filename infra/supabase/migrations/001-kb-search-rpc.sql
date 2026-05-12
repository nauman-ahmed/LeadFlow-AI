-- =============================================================================
-- Migration 001 — kb_search RPC for vector similarity search
-- Apply via Supabase SQL Editor after schema.sql has been applied.
-- Safe to re-run: uses CREATE OR REPLACE.
-- =============================================================================

create or replace function kb_search(
  query_embedding vector(768),
  match_language  text  default null,
  match_threshold float default 0.40,
  match_count     int   default 5
)
returns table (
  chunk_id    uuid,
  document_id uuid,
  title       text,
  language    text,
  content     text,
  similarity  float
)
language sql stable
as $$
  select
    c.id          as chunk_id,
    c.document_id as document_id,
    d.title       as title,
    c.language    as language,
    c.content     as content,
    1 - (e.embedding <=> query_embedding) as similarity
  from kb_embeddings e
  join kb_chunks    c on c.id = e.chunk_id
  join kb_documents d on d.id = c.document_id
  where (match_language is null or c.language = match_language)
    and 1 - (e.embedding <=> query_embedding) > match_threshold
  order by e.embedding <=> query_embedding asc
  limit match_count;
$$;

comment on function kb_search is
  'Cosine similarity search over kb_embeddings, optionally filtered by language. Returns top N chunks above threshold.';
