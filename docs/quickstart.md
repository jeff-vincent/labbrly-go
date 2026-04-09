---
id: quickstart
title: Quickstart
---

This guide gets you from zero to a working lab users can run (full page or embedded) in a few minutes.

## Prerequisites

- Org portal access (Auth0 sign‑in) + at least one API key
- Planned lab content (text, sample code, optional video)
- Base image: choose preset (Python / Node / Go) or custom image (premium)

## 1. Create a Lab

1. Portal → Labs → Create Lab  
2. Choose components (Lab Text, IDE, Terminal, Video, Scoring)  
3. Select environment (preset or custom image tag)  
4. Add optional env vars / sample code  
5. Save and note the `lab_id`

## 2. Mint a Launch Token (Server‑Side)

Exchange `{ api_key, lab_id }` for a short‑lived JWT. Never expose your org API key in client code.

Request
```bash
curl -s -X POST {BASE_URL}/auth/token \
  -H 'Content-Type: application/json' \
  -d '{
    "api_key": "sk_live_your_api_key",
    "lab_id": "YOUR_LAB_ID"
  }'
```

Response
```json
{
  "access_token": "jwt",
  "token_type": "bearer"
}
```

Notes
- Claims: `org_id`, `user_id`, `lab_id` (scoped; short TTL)  
- For quick demos you can enable `GET /auth/demo-token` (if allowed)  

## 3. Launch Options

| Scenario | Method | Notes |
|----------|--------|-------|
| Production | Reverse proxy + inject Authorization header | Token stays off URL; stricter control |
| Fast demo | Redirect with `?token=` or `#token=` | Easiest; keep TTL short |
| Embed in docs | Use `<script src="…/embed.js">` + `data-embed-lab` link | Opens modal, auto token fetch |

See: Generate End‑User Links & Embedding Labs.

## 4. User Experience Validation

1. Load page (or click embed link) with token  
2. “Starting…” while container pulls / boots  
3. Terminal attaches (auto retries)  
4. Run sample code; verify output  
5. (If video) Play media  
6. (If scored) Click Submit → receive pass/fail  

## 5. Iterate

- Adjust lab text / sample code in portal → changes apply next launch
- Optimize image (size, pinned dependencies) for faster cold starts
- Add scoring once basics proven

## Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| 401 Unauthorized | Wrong API key or expired token | Re-mint token; confirm lab_id | 
| Terminal stuck connecting | Image still pulling / pod scheduling | Wait a few seconds; reduce image size |
| Code run NotFound | Container restarted mid-session | Refresh (new pod) |
| Slow cold start | Large image or uncached layers | Slim base, pin versions, remove build caches |

## Next

- Generate End‑User Links (launch patterns)
- Embedding Labs (modal script)
- Custom Environments (bring your own image)
- Environment Isolation & Safeguards (how containers are sandboxed)