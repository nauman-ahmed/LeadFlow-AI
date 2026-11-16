# LeadFlow AI

Inbound lead qualification across **web chat** and **inbound phone**, with knowledge-base grounded answers, calendar booking, CRM webhook sync, human handoff, and multi-language support.

> Portfolio project.

## Status

| Sprint | Status | What it ships |
| --- | --- | --- |
| 0 | ✅ Done | Repo scaffold, Supabase schema, n8n workflows, prompts, i18n |
| 1 | ✅ Done | Widget + Next.js chat API + mock CRM, end to end |
| 2 | ✅ Done | RAG over Supabase pgvector + LLM replies (Ollama / OpenAI), KB ingest, KB eval set (EN 15, FR 11) and `npm run eval:kb` |
| 3 | ✅ Done | Cal.com booking (availability + create booking), HMAC-SHA256 verified Cal.com webhooks, booking upsert on `cal_booking_id` so retries never double-book |
| 4 | ✅ Done | Vapi voice agent: `/api/voice/server` with tools `capture_lead`, `search_kb`, `check_availability`, `create_booking`, `request_handoff`; shared-secret webhook auth |
| 5 | 🟡 Partly done | English + French prompts, UI strings and knowledge base |
| 6 | 🟡 Partly done | Human handoff (chat event + voice tool) done; CRM sync is still a stub n8n workflow |
| 7 | 🟡 Partly done | Demo videos in `demo/`; automated tests and hosted deploy still to do |

## Architecture (current)

```
┌─────────────┐         ┌────────────────────────┐       ┌──────────────┐
│  Widget     │──HTTP──▶│  Next.js (apps/web)    │──────▶│   Supabase   │
│ (Vite/JS)   │         │  /api/chat/*           │       │  (Postgres + │
└─────────────┘         │  /api/voice/server     │       │   pgvector)  │
                        │  /admin (mock CRM)     │       └──────────────┘
┌─────────────┐         └──┬──────────┬──────────┘
│ Vapi voice  │──tools────▶│          │
│   agent     │            ▼          ▼
└─────────────┘      ┌──────────┐  ┌──────────┐
                     │ Cal.com  │  │   n8n    │  cal-webhook (HMAC check),
                     │ bookings │  │          │  chat-turn-handler, crm-sync,
                     └──────────┘  └──────────┘  vapi-server-proxy
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
└── scripts/         Build helpers
```

## Quickstart

### Prerequisites

- **Node 20+** (a `.nvmrc` is included — `nvm use` picks it up)
- **n8n** running locally on `http://localhost:5678`
- A **DashScope (Alibaba Cloud Model Studio) API key** for Qwen, set as `DASHSCOPE_API_KEY` in `.env`
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
| LLM | Qwen via DashScope: `qwen3.6-35b-a3b` chat, `text-embedding-v4` embeddings (768d) |
| LLM (alternates) | `LLM_PROVIDER=openai` (`gpt-4o-mini`) or `LLM_PROVIDER=ollama` (`mistral:latest`, `nomic-embed-text`) |
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
| `npm run voice:gate` | Local proxy on :3002 that exposes only `POST /api/voice/server`; put your tunnel (e.g. `cloudflared tunnel --url http://127.0.0.1:3002`) in front of this, never in front of the app, so `/admin` stays private |

## Cost target

$0–$15/month during development. Real spend only kicks in for Vapi test calls (Sprint 4) and demo recordings (Sprint 7).
