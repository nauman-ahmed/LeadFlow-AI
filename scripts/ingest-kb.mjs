#!/usr/bin/env node
// Ingest markdown files from kb/{lang}/*.md into Supabase: chunk, embed, upsert.
//
// Usage:
//   npm run ingest:kb
//
// What it does:
//   1. Loads .env from repo root.
//   2. Deletes existing kb_documents (cascade-deletes chunks + embeddings)
//      so each run produces a clean state — easier to reason about during dev.
//   3. Walks kb/en/ and kb/fr/, reading every *.md file.
//   4. Parses YAML front matter, chunks the body by paragraph (~800 chars max),
//      embeds each chunk via Qwen (or OpenAI / Ollama, see EMBEDDING_PROVIDER).
//   5. Inserts kb_documents, kb_chunks, kb_embeddings rows.

import { loadEnv, REPO_ROOT } from './_load-env.mjs';
loadEnv();

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  LLM_PROVIDER = 'qwen',
  EMBEDDING_PROVIDER = LLM_PROVIDER,
  DASHSCOPE_API_KEY,
  QWEN_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  QWEN_EMBEDDING_MODEL = 'text-embedding-v4',
  QWEN_EMBEDDING_DIMENSIONS = '768',
  OLLAMA_BASE_URL = 'http://localhost:11434',
  OLLAMA_EMBEDDING_MODEL = 'nomic-embed-text',
  OPENAI_API_KEY,
  OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small'
} = process.env;

// Must match vector(N) on kb_embeddings.embedding in infra/supabase/schema.sql.
const SCHEMA_DIMENSIONS = 768;

const EMBEDDING_MODEL =
  EMBEDDING_PROVIDER === 'qwen'
    ? QWEN_EMBEDDING_MODEL
    : EMBEDDING_PROVIDER === 'openai'
      ? OPENAI_EMBEDDING_MODEL
      : OLLAMA_EMBEDDING_MODEL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[ingest-kb] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  // ws transport: Node 20 has no native WebSocket; supabase-js workaround.
  realtime: { transport: ws }
});

// -- Embedding -----------------------------------------------------------------

async function embed(text) {
  if (EMBEDDING_PROVIDER === 'qwen') {
    if (!DASHSCOPE_API_KEY) throw new Error('DASHSCOPE_API_KEY missing');
    const res = await fetch(`${QWEN_BASE_URL.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: QWEN_EMBEDDING_MODEL,
        input: text,
        dimensions: parseInt(QWEN_EMBEDDING_DIMENSIONS, 10),
        encoding_format: 'float'
      })
    });
    if (!res.ok) {
      throw new Error(`Qwen embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const j = await res.json();
    const v = j.data[0].embedding;
    return { vector: v, model: QWEN_EMBEDDING_MODEL, dimensions: v.length };
  }

  if (EMBEDDING_PROVIDER === 'openai') {
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: OPENAI_EMBEDDING_MODEL, input: text })
    });
    if (!res.ok) {
      throw new Error(`OpenAI embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const j = await res.json();
    const v = j.data[0].embedding;
    return { vector: v, model: OPENAI_EMBEDDING_MODEL, dimensions: v.length };
  }

  const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_EMBEDDING_MODEL, prompt: text })
  });
  if (!res.ok) {
    throw new Error(`Ollama embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const j = await res.json();
  const v = j.embedding;
  return { vector: v, model: OLLAMA_EMBEDDING_MODEL, dimensions: v.length };
}

// -- Front matter + chunking ---------------------------------------------------

function parseFrontMatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const eq = line.indexOf(':');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    meta[k] = v;
  }
  return { meta, body: m[2] };
}

function chunkText(text, { maxChars = 800 } = {}) {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const p of paragraphs) {
    if (!current) {
      current = p.length > maxChars ? p.slice(0, maxChars) : p;
      continue;
    }
    const next = `${current}\n\n${p}`;
    if (next.length > maxChars) {
      chunks.push(current);
      current = p.length > maxChars ? p.slice(0, maxChars) : p;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// -- Tenant --------------------------------------------------------------------

async function ensureTenant() {
  const { data: existing } = await sb
    .from('tenants')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await sb
    .from('tenants')
    .insert({ id: DEFAULT_TENANT_ID, name: 'Acme CRM Onboarding' })
    .select('id')
    .single();
  if (error) throw new Error(`create tenant: ${error.message}`);
  return created.id;
}

// -- Ingest --------------------------------------------------------------------

async function ingestFile(path, language, tenantId) {
  const raw = readFileSync(path, 'utf8');
  const { meta, body } = parseFrontMatter(raw);
  const title = meta.title || basename(path, '.md');

  console.log(`\n📄 ${path}`);
  console.log(`   title="${title}"  language=${language}`);

  const { data: doc, error: docErr } = await sb
    .from('kb_documents')
    .insert({
      tenant_id: tenantId,
      title,
      source_type: 'markdown',
      source_uri: path,
      language
    })
    .select('id')
    .single();

  if (docErr || !doc) {
    console.error(`   ✗ document insert: ${docErr?.message}`);
    return { chunks: 0, embeddings: 0 };
  }

  const chunks = chunkText(body, { maxChars: 800 });
  console.log(`   ${chunks.length} chunks`);

  let embeddings = 0;
  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i];
    const { data: chunkRow, error: chunkErr } = await sb
      .from('kb_chunks')
      .insert({
        document_id: doc.id,
        language,
        chunk_index: i,
        content,
        tokens: Math.ceil(content.length / 4) // rough estimate
      })
      .select('id')
      .single();

    if (chunkErr || !chunkRow) {
      console.error(`   ✗ chunk ${i}: ${chunkErr?.message}`);
      continue;
    }

    try {
      const { vector, model, dimensions } = await embed(content);

      if (dimensions !== SCHEMA_DIMENSIONS) {
        console.error(
          `   ✗ chunk ${i}: embedding dimension ${dimensions} != ${SCHEMA_DIMENSIONS} (schema expects ${SCHEMA_DIMENSIONS}).`
        );
        continue;
      }

      const { error: embErr } = await sb.from('kb_embeddings').insert({
        chunk_id: chunkRow.id,
        embedding: vector,
        model,
        dimensions
      });

      if (embErr) {
        console.error(`   ✗ embed ${i}: ${embErr.message}`);
      } else {
        embeddings += 1;
        process.stdout.write('.');
      }
    } catch (e) {
      console.error(`   ✗ embed ${i}: ${e.message}`);
    }
  }
  process.stdout.write('\n');
  return { chunks: chunks.length, embeddings };
}

async function main() {
  const startedAt = Date.now();
  console.log('🧠 LeadFlow KB ingestion');
  console.log(`   provider: ${EMBEDDING_PROVIDER}`);
  console.log(`   model:    ${EMBEDDING_MODEL}`);

  const tenantId = await ensureTenant();
  console.log(`   tenant:   ${tenantId}`);

  // Clean slate: cascade-delete docs -> chunks -> embeddings for this tenant.
  const { error: delErr } = await sb.from('kb_documents').delete().eq('tenant_id', tenantId);
  if (delErr) {
    console.error(`✗ delete existing kb_documents: ${delErr.message}`);
    process.exit(1);
  }
  console.log('   wiped existing kb_documents for this tenant');

  const kbDir = resolve(REPO_ROOT, 'kb');
  if (!existsSync(kbDir)) {
    console.error(`✗ ${kbDir} does not exist`);
    process.exit(1);
  }

  let totalChunks = 0;
  let totalEmbeddings = 0;

  for (const lang of ['en', 'fr']) {
    const langDir = join(kbDir, lang);
    if (!existsSync(langDir)) {
      console.log(`   (skipping kb/${lang}: not present)`);
      continue;
    }
    const files = readdirSync(langDir).filter((f) => f.endsWith('.md'));
    for (const f of files) {
      const r = await ingestFile(join(langDir, f), lang, tenantId);
      totalChunks += r.chunks;
      totalEmbeddings += r.embeddings;
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n✅ Done in ${elapsed}s`);
  console.log(`   ${totalChunks} chunks, ${totalEmbeddings} embeddings`);

  const { count } = await sb
    .from('kb_embeddings')
    .select('*', { count: 'exact', head: true });
  console.log(`   total kb_embeddings in DB: ${count}`);
}

main().catch((err) => {
  console.error('\n💥 Ingestion failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
