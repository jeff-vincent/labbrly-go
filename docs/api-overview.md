---
id: api-overview
title: API overview
---

<p class="doc-lead">A public, high‑level map of endpoints the frontend calls. Shapes are illustrative; keep your org API key server‑side and issue short‑lived user tokens.</p>

## Auth

- POST /auth/token  
  Exchange `{ api_key, lab_id }` → `{ access_token }` (short‑lived user JWT)
- POST /auth/embed/token  
  Lab‑scoped token used by the public embed script (no org API key exposed)
- GET /auth/demo-token  
  (If enabled) quick trial token for demos

Notes
- Portal (admin) uses Auth0 RS256; audience `urn:labthingy:api`
- End‑user JWT carried via `Authorization: Bearer` header or URL token (redirect / fragment) or auto when embedding

## Labs

- GET /labs
  - List labs for the org (admin portal; Auth0 token).
- POST /labs/lab
  - Create a lab with fields like: `name`, `org_id`, `container_image`, `elements[]`, `lab_text`, `example_code`, `script_name`, `execution_command`, `terminal_commands`, `scored_lab`.
- GET /labs/lab
  - Fetch the active lab definition for the end‑user session (derived from the JWT claims).
- PUT /labs/lab/:id
  - Update a lab.
- DELETE /labs/lab/:id
  - Delete a lab.

## Orgs

- GET /orgs/org
  - Retrieve org profile (name, account_type, api_keys, etc.).
- PUT /orgs/org
  - Update org fields (e.g., `api_keys`).
- PUT /orgs/org/end-user-data
  - Record user events like `"lab started"` and `"lab completed"` with `{ lab_id }`.

## Compute

- POST /compute/start
  - Start a per‑user environment. Body may include `{ container_image }`.
- POST /compute/run
  - Execute code inside the environment. Multipart form fields: `script`, `script_name`, `execution_command`. Returns program output.
- GET /compute/check-lab
  - For scored labs, run validations and return `{ status: 'success' | 'error', output }`.
- WS /compute/terminal/:userId
  - WebSocket terminal attaching to the user container. Send the JWT; the UI auto‑retries while the pod starts.
- POST /compute/describe-namespace
  - Describe resources in a namespace. Body: `{ namespace }`. Returns a list/grouping of K8s resources.

## Video

- POST /video/upload
  - Upload an instructional video for a lab. Multipart: `video`, `lab_id`.
- GET /video/stream/:labId
  - Stream the video for a lab as a blob response.

## Images / Builds (Custom Environments)

- POST /images/check-availability — verify image name uniqueness
- POST /build/image — submit Dockerfile (& optional files) for build (premium tiers)

## Security Essentials

- Mint tokens server‑side only; never ship API keys to the browser
- JWT TTLs are intentionally short; scope is a single lab session
- Reverse proxy preferred in production; URL tokens & embeds ideal for trials / marketing
- Containers are per‑user & non‑root (see Environment Isolation & Safeguards)
