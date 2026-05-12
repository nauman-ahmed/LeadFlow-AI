# LeadFlow AI

Inbound lead qualification across **web chat** and **inbound phone**, with knowledge-base grounded answers, calendar booking, CRM webhook sync, human handoff, and multi-language support.

> Portfolio project mirroring a real Upwork brief. See [doc/EXECUTION_PLAN.md](./doc/EXECUTION_PLAN.md) for the sprint-by-sprint build plan and [doc/](./doc) for the full phase docs.

## Status

| Sprint | Status | What it ships |
| --- | --- | --- |
| 0 | ✅ Done | Repo scaffold, Supabase schema, n8n stubs, prompts, i18n |
| **1** | ✅ **Code complete** | Widget + Next.js chat API + mock CRM, end-to-end with stub replies |
| 2 | Up next | RAG + LLM replies (Ollama / OpenAI) |
| 3 | Pending | Calendar booking (Cal.com + Google) |
| 4 | Pending | Voice agent (Vapi) |
| 5 | Pending | Multi-language polish |
| 6 | Pending | Real CRM sync + human handoff |
| 7 | Pending | Tests + deploy + portfolio assets |

## Architecture (current)

```
┌─────────────┐         ┌────────────────────┐       ┌──────────────┐
│  Widget     │──HTTP──▶│  Next.js (apps/web)│──────▶│   Supabase   │
│ (Vite/JS)   │         │  /api/chat/*       │       │  (Postgres + │
└─────────────┘         │  /admin (mock CRM) │       │   pgvector)  │
                        └─────────┬──────────┘       └──────────────┘
                                  │
                                  ▼
                            ┌──────────┐
                            │   n8n    │  ← Stub reply now; RAG in Sprint 2
                            └──────────┘
```

## Repo layout

```
LeadFlow AI/
├── apps/
│   ├── web/         Next.js: landing page + /api/chat + /admin (mock CRM)
│   └── widget/      React + Vite: single embeddable JS bundle
├── infra/
│   └── supabase/    schema.sql, seed.sql, README
├── n8n/
│   └── workflows/   Importable JSON workflow files
├── prompts/{en,fr}  System / qualification / fallback prompts
├── i18n/            Widget UI strings per language
├── kb/              Source knowledge base docs (Sprint 2)
├── evals/           KB evaluation set (Sprint 2)
├── scripts/         Build helpers
└── doc/             Project planning + phases + execution plan
```

## Quickstart

### Prerequisites

- **Node 20+** (a `.nvmrc` is included — `nvm use` picks it up)
- **n8n** running locally on `http://localhost:5678`
- **Ollama** running locally on `http://localhost:11434` with `mistral:latest` and `nomic-embed-text` pulled
- A **Supabase** project

### 1. Configure secrets

```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# (Supabase Dashboard -> Project Settings -> API)
```

### 2. Apply the database schema

Open Supabase SQL Editor and run, in order:

- [`infra/supabase/schema.sql`](infra/supabase/schema.sql)
- [`infra/supabase/seed.sql`](infra/supabase/seed.sql)

See [infra/supabase/README.md](./infra/supabase/README.md) for details.

### 3. Import the n8n workflows

In n8n at `http://localhost:5678`:

- Workflows → + → Import from File →
  - [`n8n/workflows/chat-turn-handler.json`](./n8n/workflows/chat-turn-handler.json) → **Activate**
  - [`n8n/workflows/crm-sync.json`](./n8n/workflows/crm-sync.json) → **Activate**

See [n8n/README.md](./n8n/README.md) for details and a curl smoke test.

### 4. Install dependencies + build the widget

```bash
nvm use            # picks up Node 20 from .nvmrc
npm install
npm run build:widget   # outputs apps/web/public/leadflow-widget.js
```

### 5. Run the dev servers

```bash
npm run dev:web    # http://localhost:3000  (Next.js: landing + API + /admin)
```

Optional, for hot reload on the widget:

```bash
npm run dev:widget # http://localhost:5173  (Vite test harness)
```

### 6. Try it

- Open <http://localhost:3000>. Click the chat bubble. Send a message.
- Open <http://localhost:3000/admin> in another tab — refresh after each message to see leads land.
- Open the lead detail page to inspect the full transcript.

## Tech stack

| Layer | Choice |
| --- | --- |
| Web chat | Custom React + Vite widget (single JS file) |
| Backend | Next.js 15 App Router |
| Voice | Vapi (Retell / Bland are drop-in alternates) — Sprint 4 |
| Orchestration | n8n (self-hosted) |
| Database | Supabase (Postgres + Auth + pgvector) |
| LLM (dev) | Ollama: `mistral:latest` chat, `nomic-embed-text` embeddings |
| LLM (prod) | OpenAI: `gpt-4o-mini` chat, `gpt-4o` summaries, `text-embedding-3-small` |
| Scheduling | Cal.com + Google Calendar — Sprint 3 |
| Real CRM | HubSpot free (toggleable) — Sprint 6 |
| Languages | English + French |

## Useful scripts

| Command | Purpose |
| --- | --- |
| `npm run dev:web` | Next.js dev server on :3000 |
| `npm run dev:widget` | Vite dev server on :5173 for widget hot reload |
| `npm run build:widget` | Build embeddable bundle + copy to web/public |
| `npm run build:web` | Build Next.js production bundle |
| `npm run typecheck` | TypeScript check across workspaces |

## Cost target

$0–$15/month during development. Real spend only kicks in for Vapi test calls (Sprint 4) and demo recordings (Sprint 7).
