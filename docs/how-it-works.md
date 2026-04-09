---
id: how-it-works
title: How it works
---

High‑level flow from a user click (or redirect) to an interactive container.

## Auth (Launch Tokens)

- Exchange `{ api_key, lab_id }` → short‑lived JWT (`POST /auth/token`)
- Embed modal path auto‑mints a lab‑scoped token via `POST /auth/embed/token`
- Claims: `org_id`, `user_id`, `lab_id` (minimal & time‑boxed)
- Admin portal uses Auth0 (RS256) — separate from end‑user HS256 token

## Compute (Ephemeral Container)

- One container per active user session (preset or custom image)
- Terminal (WebSocket) attaches after readiness; retries while starting
- Run endpoint executes provided script within that container
- Optional scoring endpoint runs validation & returns result

## UI Data Flow

1. Token presented (query, fragment, Authorization header, or embed)  
2. Lab definition fetched (elements: text, IDE, terminal, video, scoring)  
3. Compute start requested; terminal begins auto‑retry loop  
4. User runs code / interacts; events may be logged for analytics (privacy aware)  
5. (If video) streamed on demand  
6. (If scoring) check endpoint returns pass/fail + feedback  

## Security & Isolation (Surface Level)

- Short JWT TTLs; scope limited to one lab
- Non‑root container per user (see “Environment Isolation & Safeguards”)
- No org API key in browser; server mints tokens
- Recommended: reverse proxy in production, links/embeds for trials & marketing

### Sequence (high‑level)

```mermaid
sequenceDiagram
    autonumber
    actor User as End user
    participant Backend as Your Backend
    participant Auth as Auth service
    participant UI as Lab Thingy UI
    participant Labs as Labs service
    participant Compute as Compute service
    participant Orgs as Orgs service
    participant Video as Video service

    User->>Backend: Start lab (lab_id)
    Backend->>Auth: POST /auth/token { api_key, lab_id }
    Auth-->>Backend: { access_token }
    Backend-->>User: 302 to UI with ?token=<jwt> (or reverse proxy)

    User->>UI: Load UI with token
    UI->>UI: Decode token (org_id, user_id, lab_id)
    UI->>Labs: GET /labs/lab (Bearer <jwt>)
    Labs-->>UI: Lab definition (elements, image, commands)
    UI->>Compute: POST /compute/start { container_image }
    Compute-->>UI: 200 (env starting)
    UI-->>Compute: WS /compute/terminal/:userId (auto‑retry until ready)

    rect rgb(245,245,245)
    note over UI,Compute: During the lab
    UI->>Compute: POST /compute/run (script, script_name, execution_command)
    Compute-->>UI: Program output
    UI->>Video: GET /video/stream/:labId (if video element)
    Video-->>UI: Video blob
    end

    UI->>Orgs: PUT /orgs/org/end-user-data { event: "lab started", lab_id }
    alt Scored lab
      UI->>Compute: GET /compute/check-lab
      Compute-->>UI: { status, output }
      UI->>Orgs: PUT /orgs/org/end-user-data { event: "lab completed", lab_id }
    end
```
