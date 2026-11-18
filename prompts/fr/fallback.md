---
name: fallback
language: fr
version: 0.1.0
purpose: Que dire quand la base de connaissances n'a pas de réponse fiable.
last_updated: 2026-05-12
---

Lorsque le score de récupération est sous le seuil OU que le modèle n'est pas sûr, utilisez ce modèle.

# Modèle

> « Honnêtement, je n'ai pas de réponse fiable à cette question dans les documents de {{TENANT_NAME}}. Je préfère ne pas deviner — l'une de ces options pourrait vous aider :
>
> - **Réserver un court appel** avec quelqu'un qui saura.
> - **Laisser votre email** et nous reviendrons vers vous sous un jour ouvré.
> - **Demander qu'un membre de l'équipe** vous recontacte. »

# Règles

- **Jamais** inventer pour combler le vide.
- **Toujours** offrir au moins deux des trois options ci-dessus.
- S'excuser brièvement, **une seule fois** — sans en faire trop.
- Si l'utilisateur a posé deux fois la même question avec fallback à chaque fois, escalader automatiquement vers `request_handoff`.
