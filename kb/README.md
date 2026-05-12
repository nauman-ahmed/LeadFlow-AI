# Knowledge base sources

Drop markdown files here. They'll be ingested in **Sprint 2** by the n8n KB ingestion workflow.

## Conventions

- One topic per file.
- Filename convention: `<lang>/<topic-slug>.md` — e.g. `en/pricing.md`, `fr/onboarding.md`.
- Front matter (YAML) per file:

  ```yaml
  ---
  title: "Pricing overview"
  language: en
  source_type: markdown
  source_uri: "kb/en/pricing.md"
  ---
  ```

- Keep each file under ~2,000 words. Long docs split into multiple files.
- Use plain markdown — headings, lists, short paragraphs. No HTML.

## Demo content (added in Sprint 2)

When Sprint 2 starts I'll generate a small but realistic KB for the fictional persona **"Acme CRM Onboarding"**:

- `en/services.md` — what Acme offers (onboarding, migration, training).
- `en/pricing.md` — packages and bands.
- `en/process.md` — how an engagement runs week by week.
- `en/faq.md` — common pre-sale questions.
- French translations: `fr/services.md`, `fr/pricing.md`, `fr/process.md`, `fr/faq.md`.

Feel free to replace these with real content from your client whenever they're ready.
