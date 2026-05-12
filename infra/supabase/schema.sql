-- =============================================================================
-- LeadFlow AI — Supabase schema (Sprint 0)
-- Apply via Supabase SQL Editor or `psql $DATABASE_URL -f schema.sql`.
-- Safe to re-run: every CREATE uses IF NOT EXISTS where possible.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists vector;       -- pgvector for embeddings
create extension if not exists pgcrypto;     -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type lead_status as enum ('new', 'qualified', 'booked', 'handoff', 'lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_source as enum ('web', 'voice');
exception when duplicate_object then null; end $$;

do $$ begin
  create type conversation_channel as enum ('web', 'voice');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_role as enum ('user', 'assistant', 'tool', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type appointment_status as enum ('booked', 'cancelled', 'rescheduled', 'no_show', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type crm_event_status as enum ('pending', 'success', 'failed', 'replayed');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Tenants  (single-tenant MVP, but the column is here for future expansion)
-- -----------------------------------------------------------------------------
create table if not exists tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Leads
-- -----------------------------------------------------------------------------
create table if not exists leads (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid references tenants(id),
  name                  text,
  email                 text,
  phone                 text,
  language              text default 'en',
  source                lead_source not null,
  status                lead_status not null default 'new',
  qualification_score   int default 0,
  tags                  text[] default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists leads_status_idx on leads(status);
create index if not exists leads_source_idx on leads(source);
create index if not exists leads_email_idx  on leads(email);
create index if not exists leads_language_idx on leads(language);

-- -----------------------------------------------------------------------------
-- Conversations  (one per chat session or one per phone call)
-- -----------------------------------------------------------------------------
create table if not exists conversations (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid references leads(id) on delete cascade,
  channel      conversation_channel not null,
  external_id  text,                          -- web session_id, or vapi_call_id
  language     text default 'en',
  handoff      boolean not null default false,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz
);
create unique index if not exists conversations_external_id_idx
  on conversations(external_id)
  where external_id is not null;
create index if not exists conversations_lead_id_idx on conversations(lead_id);

-- -----------------------------------------------------------------------------
-- Messages  (chat turns; voice transcripts also land here)
-- -----------------------------------------------------------------------------
create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role            message_role not null,
  content         text not null,
  redacted        boolean default false,
  prompt_version  text,
  feedback        smallint,                   -- thumbs: -1 / 0 / 1
  created_at      timestamptz not null default now()
);
create index if not exists messages_conversation_id_idx on messages(conversation_id);
create index if not exists messages_created_at_idx       on messages(created_at);

-- -----------------------------------------------------------------------------
-- Call recordings  (voice channel only)
-- -----------------------------------------------------------------------------
create table if not exists call_recordings (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  provider        text default 'vapi',
  recording_url   text,
  transcript_url  text,
  duration_sec    int,
  created_at      timestamptz not null default now()
);
create index if not exists call_recordings_conversation_id_idx
  on call_recordings(conversation_id);

-- -----------------------------------------------------------------------------
-- Summaries  (LLM-generated post-conversation summary + qualification)
-- -----------------------------------------------------------------------------
create table if not exists summaries (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid references conversations(id) on delete cascade,
  text               text not null,
  text_en            text,                    -- English version when conversation language != en
  qualification_json jsonb,
  model              text,
  prompt_version     text,
  created_at         timestamptz not null default now()
);
create index if not exists summaries_conversation_id_idx on summaries(conversation_id);

-- -----------------------------------------------------------------------------
-- Appointments  (Cal.com bookings)
-- -----------------------------------------------------------------------------
create table if not exists appointments (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references leads(id) on delete cascade,
  cal_booking_id  text,
  google_event_id text,
  start_at        timestamptz not null,
  end_at          timestamptz not null,
  status          appointment_status not null default 'booked',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists appointments_cal_booking_id_idx
  on appointments(cal_booking_id)
  where cal_booking_id is not null;
create index if not exists appointments_lead_id_idx on appointments(lead_id);
create index if not exists appointments_start_at_idx on appointments(start_at);

-- -----------------------------------------------------------------------------
-- Knowledge base
-- -----------------------------------------------------------------------------
create table if not exists kb_documents (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id),
  title       text not null,
  source_type text,                            -- 'markdown' | 'pdf' | 'url'
  source_uri  text,
  language    text default 'en',
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists kb_documents_language_idx on kb_documents(language);

create table if not exists kb_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid references kb_documents(id) on delete cascade,
  language     text default 'en',
  chunk_index  int not null,
  content      text not null,
  tokens       int,
  created_at   timestamptz not null default now()
);
create index if not exists kb_chunks_document_id_idx on kb_chunks(document_id);
create index if not exists kb_chunks_language_idx    on kb_chunks(language);

-- NOTE: vector(768) matches `nomic-embed-text` (the Ollama default for this project).
--       If you switch to OpenAI `text-embedding-3-small` (1536d), recreate this
--       table with vector(1536). Mixing dimensions in one column is not supported.
create table if not exists kb_embeddings (
  id          uuid primary key default gen_random_uuid(),
  chunk_id    uuid references kb_chunks(id) on delete cascade unique,
  embedding   vector(768),
  model       text not null,
  dimensions  int  not null,
  created_at  timestamptz not null default now()
);
-- ANN index — uncomment after the table has a meaningful number of rows.
-- create index on kb_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- -----------------------------------------------------------------------------
-- CRM event audit log  (outbound webhooks to mock CRM / HubSpot)
-- -----------------------------------------------------------------------------
create table if not exists crm_events (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references leads(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  event_type      text not null,              -- 'lead.created', 'lead.qualified', ...
  payload         jsonb not null,
  payload_hash    text,
  target_url      text,
  status          crm_event_status not null default 'pending',
  retries         int not null default 0,
  last_error      text,
  delivered_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists crm_events_lead_id_idx on crm_events(lead_id);
create index if not exists crm_events_status_idx  on crm_events(status);
create index if not exists crm_events_type_idx    on crm_events(event_type);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_updated_at on leads;
create trigger leads_updated_at
  before update on leads
  for each row execute function set_updated_at();

drop trigger if exists appointments_updated_at on appointments;
create trigger appointments_updated_at
  before update on appointments
  for each row execute function set_updated_at();

drop trigger if exists kb_documents_updated_at on kb_documents;
create trigger kb_documents_updated_at
  before update on kb_documents
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Convenience view used by the mock CRM dashboard
-- -----------------------------------------------------------------------------
create or replace view leads_overview as
select
  l.id,
  l.name,
  l.email,
  l.phone,
  l.language,
  l.source,
  l.status,
  l.qualification_score,
  l.tags,
  l.created_at,
  l.updated_at,
  (select count(*) from conversations c where c.lead_id = l.id) as conversation_count,
  (select max(c.started_at) from conversations c where c.lead_id = l.id) as last_conversation_at,
  (select count(*) from appointments a where a.lead_id = l.id) as appointment_count
from leads l;
