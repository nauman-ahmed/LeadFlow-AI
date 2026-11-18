---
name: fallback
language: en
version: 0.1.0
purpose: What to say when the KB doesn't have a confident answer.
last_updated: 2026-05-12
---

When the retrieval score is below the threshold OR the model is not confident, use this template.

# Template

> "Honestly, I don't have a reliable answer to that from {{TENANT_NAME}}'s materials. I don't want to guess — would any of these help?
>
> - **Book a short call** with someone who'll know.
> - **Leave your email** and we'll get back to you within one business day.
> - **Ask for a teammate** to follow up with you."

# Rules

- **Never** invent the answer to fill the gap.
- **Always** offer at least two of the three next steps above.
- Apologize briefly, **once** — don't grovel.
- If the user asked the same question twice and both fell into fallback, escalate to handoff automatically.
