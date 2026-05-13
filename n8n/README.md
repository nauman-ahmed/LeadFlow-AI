# n8n workflows

This is the orchestration hub for everything LeadFlow does: chat turns, voice tool calls, KB ingestion, calendar bookings, CRM webhooks, and handoff alerts.

The workflows here are committed as JSON so the build is reproducible and reviewable.

## Workflows

| File | Purpose | Webhook path | Sprint |
| --- | --- | --- | --- |
| `chat-turn-handler.json` | Receives a chat turn from the widget, returns an assistant reply. | `POST /webhook/leadflow/chat-turn` | 1 (stub now, AI in 2) |
| `crm-sync.json` | Receives internal events, fans out to mock CRM / HubSpot. | `POST /webhook/leadflow/crm-sync` | 1 (stub now, real CRM in 6) |
| `cal-webhook.json` | Cal.com → Supabase: HMAC-verify Cal events and upsert `appointments`. | `POST /webhook/leadflow/cal-webhook` | 3 |

Each new sprint adds more workflows (RAG ingestion, Cal.com webhooks, Vapi tool dispatcher, post-call processing, handoff, etc.).

## How to import

In your local n8n at `http://localhost:5678`:

1. **Workflows → Create Workflow → ⋮ menu → Import from File**.
2. Pick the JSON file from this folder.
3. Save the workflow.
4. **Activate** the workflow with the toggle in the top-right.

Repeat for each `*.json` file in `workflows/`.

## Testing the stubs (Sprint 0 sanity check)

After importing and activating both workflows, test them with curl:

### Chat turn

```bash
curl -X POST http://localhost:5678/webhook/leadflow/chat-turn \
  -H 'Content-Type: application/json' \
  -d '{
    "session_id": "test-session-1",
    "message": "Hello!",
    "language": "en"
  }'
```

Expected response (Sprint 0 stub):

```json
{
  "session_id": "test-session-1",
  "language": "en",
  "reply": "Hi! This is a Sprint 0 stub reply. Your message: \"Hello!\".",
  "prompt_version": "stub-0.1",
  "timestamp": "2026-..."
}
```

### CRM sync

```bash
curl -X POST http://localhost:5678/webhook/leadflow/crm-sync \
  -H 'Content-Type: application/json' \
  -d '{
    "event": "lead.created",
    "lead": { "id": "00000000-0000-0000-0000-0000000000aa" }
  }'
```

Expected response:

```json
{
  "ok": true,
  "event_type": "lead.created",
  "lead_id": "00000000-0000-0000-0000-0000000000aa",
  "received_at": "2026-..."
}
```

## Test mode vs production paths

n8n webhooks have two URLs depending on activation state:

- **Test (only fires once after clicking "Execute workflow" in the editor):** `…/webhook-test/leadflow/chat-turn`
- **Production (workflow is Activated):** `…/webhook/leadflow/chat-turn`

The `.env` value `N8N_WEBHOOK_BASE_URL` is the **production** base — once you activate a workflow, the URL above just works.

## Conventions enforced from Sprint 1 onward

- Every workflow accepts a `correlation_id` (the chat `session_id` or `vapi_call_id`) and threads it through every node so executions are searchable.
- Inbound webhooks check the `x-leadflow-secret` header against `N8N_WEBHOOK_SECRET` (added in Sprint 1).
- Outbound CRM webhooks are HMAC-signed (added in Sprint 6).
- Every workflow writes one audit row to `crm_events` (Sprint 6) for traceability.

## `cal-webhook` setup notes

After importing `cal-webhook.json` and opening it in n8n:

1. Open the **Config** node and replace the three placeholders:
   - `webhook_secret` — must equal `CAL_WEBHOOK_SECRET` in `.env` and the secret you set on the Cal.com webhook subscriber.
   - `supabase_url` — same as `SUPABASE_URL` in `.env`.
   - `supabase_service_key` — same as `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
2. **Activate** the workflow.
3. In Cal.com → Settings → Developer → Webhooks add a subscriber:
   - URL: `https://<your-tunnel-domain>/webhook/leadflow/cal-webhook`
     (locally: run `cloudflared tunnel --url http://localhost:5678` and use the tunnel URL)
   - Subscribe to `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`.
   - Secret: same as `webhook_secret` above.
4. Test by creating a booking in the chat widget (or directly on Cal.com) and confirm a new row appears in Supabase `appointments`.

> The chat-initiated booking path writes the appointment row immediately via the Next.js API, so this webhook is the **mirror** that keeps Supabase in sync when bookings are created/changed outside the chat. The workflow is idempotent on `cal_booking_id`.

## Updating a workflow

When I change a workflow JSON in this repo:

1. Re-import it in n8n (it'll overwrite by name if you choose Replace).
2. **Re-activate** if it was active — import deactivates by default.

For local dev only. In production, n8n's REST API + the `n8n:workflows` script can automate this.
