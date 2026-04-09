---
id: intro
title: Welcome to Lab Thingy
slug: /
---

<p class="doc-lead">Lab Thingy lets you publish interactive, browser‑based labs (code + terminal + optional video) backed by short‑lived, isolated containers—no platform build or infra babysitting required.</p>

## Core Capabilities

- Visual lab builder (Auth0‑protected org portal)
- Short‑lived JWT launch tokens (server‑minted)
- In‑browser IDE (Monaco) + Run inside the user’s container
- Live terminal (WebSocket) with auto‑retry on cold start
- Optional video panel (upload & stream)
- Optional scored labs (pass/fail feedback)
- One‑line embeddable launcher (`<script src=…/embed.js>`)
- Custom Environments (bring your own Docker image, premium tiers)

## Quick Mental Model

Each user = one ephemeral container (non‑root) inside an org namespace. When TTL or inactivity hits, it’s reclaimed. See “Environment Isolation & Safeguards” for the boundary details you actually need; deeper internal architecture is intentionally abstracted.

Launch paths:
1. Redirect / embed with a time‑limited token (fastest)  
2. Reverse proxy & inject Authorization (production hardening)  
3. (Coming) Direct SSO session for portal + labs without token link

## Typical Flow

1. Your backend exchanges `{ api_key, lab_id }` → short‑lived JWT
2. User hits the UI (full page or embed modal) carrying that token
3. Lab definition loads (elements: text, IDE, terminal, video, scoring)
4. Container starts; terminal attaches automatically once ready
5. User edits, runs code, optionally watches video or submits scoring check

## Use Cases

- Product‑led growth trials & activation funnels
- DevRel tutorials & launch blog embeds
- Customer education / certification checkpoints
- Sales engineering repeatable demos

## What’s Early / Roadmap

- Inline host ↔ iframe analytics events (roadmap)
- Resource meter (CPU/RAM) in UI (roadmap)
- RAG / AI assistant integration (roadmap)

## Security & Isolation Snapshot

- Per‑user container; no shared filesystem
- Non‑root user; minimized capabilities
- Org namespace boundaries (quotas & cleanup)
- Short JWT TTLs (scope: org_id, lab_id, user_id)

## Next Steps

| Goal | Doc |
|------|-----|
| Create first lab | Quickstart |
| Generate launch links | Generate End‑User Links |
| Embed in docs/blog | Embedding Labs |
| Bring your own image | Custom Environments |
| Understand container boundaries | Environment Isolation & Safeguards |

Proceed to the Quickstart to ship your first interactive lab.