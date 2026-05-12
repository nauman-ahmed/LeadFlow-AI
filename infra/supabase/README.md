# Supabase setup

This folder holds everything needed to bring the LeadFlow database up to date.

## Files

| File | Purpose |
| --- | --- |
| `schema.sql` | All tables, enums, indexes, triggers, pgvector setup. Idempotent. |
| `seed.sql` | One demo tenant + one sample lead so the mock CRM is non-empty. |

## Apply the schema (recommended path — Supabase SQL Editor)

1. Open your Supabase project: **wapvlnajywmtfmayiqke.supabase.co**.
2. Go to **SQL Editor → New query**.
3. Open `schema.sql`, copy the contents, paste into the editor.
4. Click **Run**. Should complete in 2–3 seconds.
5. Repeat for `seed.sql`.

## Apply via psql (alternative)

If you've installed `psql` and have the database password handy:

```bash
psql "postgresql://postgres:<DB_PASSWORD>@db.wapvlnajywmtfmayiqke.supabase.co:5432/postgres" \
  -f infra/supabase/schema.sql

psql "postgresql://postgres:<DB_PASSWORD>@db.wapvlnajywmtfmayiqke.supabase.co:5432/postgres" \
  -f infra/supabase/seed.sql
```

The DB password is on **Project Settings → Database → Connection string**.

## Verify

After running both files, in the SQL Editor:

```sql
select count(*) as leads from leads;
select count(*) as conversations from conversations;
select count(*) as messages from messages;

-- Confirm pgvector is installed
select extname from pg_extension where extname = 'vector';
```

Expected: `leads = 1`, `conversations = 1`, `messages = 2`, `vector` extension installed.

## Embedding dimensions note

The `kb_embeddings.embedding` column is `vector(768)`, matching Ollama's `nomic-embed-text`.

If you later switch to **OpenAI `text-embedding-3-small`** (1536-dim), drop and recreate the table:

```sql
drop table kb_embeddings cascade;

create table kb_embeddings (
  id         uuid primary key default gen_random_uuid(),
  chunk_id   uuid references kb_chunks(id) on delete cascade unique,
  embedding  vector(1536),
  model      text not null,
  dimensions int  not null,
  created_at timestamptz not null default now()
);
```

You'll then need to re-embed all `kb_chunks`.

## ANN index timing

The schema deliberately leaves the pgvector ANN index commented out. Add it **after** Sprint 2 once we have a few hundred chunks:

```sql
create index on kb_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);
```

With < 1k rows, sequential scan is faster anyway.
