# Evaluation sets

Small, version-controlled test sets we re-run after every prompt or model change. This is the artifact the client brief calls out: *"iterating on conversation flow based on real chat and call data"*.

## Files (added in Sprint 2)

| File | Purpose |
| --- | --- |
| `kb.en.jsonl` | KB Q/A in English — expected answers, citations, expected "I don't know" cases. |
| `kb.fr.jsonl` | Same in French. |
| `qualification.jsonl` | Sample dialogs and expected qualification scores. |
| `fallback.jsonl` | Out-of-scope questions — must trigger fallback, not invent answers. |

## Format

One JSON object per line:

```json
{
  "id": "pricing-1",
  "language": "en",
  "input": "How much is the basic package?",
  "expected_keywords": ["package", "/month"],
  "must_cite": "Pricing overview",
  "must_not_say": ["I don't know", "we have plans starting at $1,000"]
}
```

## Runner (added in Sprint 2)

```bash
npm run eval:kb
```

Will iterate `kb.*.jsonl`, hit the same RAG endpoint the chatbot uses, score pass/fail, and write a Markdown report into `evals/reports/`.
