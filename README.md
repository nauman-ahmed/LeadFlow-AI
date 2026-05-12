# LeadFlow AI

Inbound lead qualification across **web chat** and **inbound phone**, with knowledge-base grounded answers, calendar booking, CRM webhook sync, human handoff, and multi-language support.

> Portfolio project mirroring a real Upwork brief. See [doc/EXECUTION_PLAN.md](./doc/EXECUTION_PLAN.md) for the sprint-by-sprint build plan and [doc/](./doc) for the full phase docs.

## Architecture (high level)

```
┌─────────────┐         ┌──────────────┐       ┌──────────────┐
│  Widget     │──HTTP──▶│ chat-backend │──────▶│              │
│  (Vite/JS)  │         │  (Next.js)   │       │              │
└─────────────┘         └──────────────┘       │              │
                                                │     n8n      │──▶ Supabase (Postgres + pgvector)
┌─────────────┐         ┌──────────────┐       │  workflows   │──▶ Cal.com  (booking)
│  Phone      │──Vapi──▶│  Vapi tools  │──────▶│              │──▶ Google Calendar
│  caller     │         │              │       │              │──▶ OpenAI / Ollama (LLM + embeddings)
└─────────────┘         └──────────────┘       │              │──▶ HubSpot CRM (webhook, toggleable)
                                                │              │──▶ Email (operator handoff)
                                                └──────────────┘
                                                       │
                                                       ▼
                                                ┌──────────────┐
                                                │   mock CRM   │  (Next.js page reading from Supabase)
                                                │  dashboard   │
                                                └──────────────┘
```

## Tech stack

| Layer | Choice |
| --- | --- |
| Web chat | Custom **React + Vite** widget (single embeddable JS file) |
| Backend | **Next.js App Router** (chat API + mock CRM in one app) |
| Voice | **Vapi** (Retell / Bland are drop-in alternates) |
| Orchestration | **n8n** (self-hosted, local) |
| Database | **Supabase** (Postgres + Auth + **pgvector**) |
| LLM (dev) | **Ollama** — `mistral:latest` chat, `nomic-embed-text` embeddings |
| LLM (prod) | **OpenAI** — `gpt-4o-mini` chat, `gpt-4o` summaries, `text-embedding-3-small` |
| Scheduling | **Cal.com** (free tier) + **Google Calendar** |
| Notifications | **Email** (Resend / SMTP) for operator handoff |
| Real CRM | **HubSpot** free (toggleable) |
| Languages | English + French |

## Repo layout

```
LeadFlow AI/
├── apps/
│   ├── web/             # Next.js: chat backend API + mock CRM + landing page (Sprint 1+)
│   └── widget/          # React + Vite embeddable chat widget         (Sprint 1+)
├── infra/
│   └── supabase/
│       ├── schema.sql   # Tables + pgvector + enums + triggers
│       ├── seed.sql     # Demo tenant + sample lead
│       └── README.md    # How to apply
├── n8n/
│   ├── workflows/       # Importable n8n workflow JSON
│   └── README.md        # Import + webhook URLs
├── prompts/
│   ├── en/              # English system / qualification / fallback prompts
│   └── fr/              # French equivalents
├── i18n/                # Widget UI strings per language
├── kb/                  # Source knowledge base documents (Sprint 2)
├── evals/               # KB eval set + runner (Sprint 2)
├── doc/                 # Project planning + phases + execution plan
├── .env.example
├── .gitignore
└── package.json
```

## Quickstart (Sprint 0 state)

1. **Clone / open this folder.**
2. **Copy env template:**
   ```bash
   cp .env.example .env
   ```
   Fill in `SUPABASE_*`. Everything else can stay default for Sprint 0.
3. **Apply the Supabase schema** — see [infra/supabase/README.md](./infra/supabase/README.md).
4. **Import the n8n workflows** — see [n8n/README.md](./n8n/README.md).
5. **Confirm Ollama is running** with the models you need:
   ```bash
   ollama list
   # expect mistral:latest and nomic-embed-text
   ```
6. **Confirm n8n is running** at `http://localhost:5678`.

Once these check out, Sprint 1 begins: widget + chat-backend + mock CRM — the first end-to-end demo.

## Roadmap

See [doc/EXECUTION_PLAN.md](./doc/EXECUTION_PLAN.md). Current state: **Sprint 0 complete** (scaffolding, schema, n8n stubs).

## Cost target

$0–$15/month during development. Real spend only kicks in for Vapi test calls (Sprint 4) and demo recordings (Sprint 7).
