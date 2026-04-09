---
title: Generate End-User Links
---

Give each end user a one‑click way to launch a lab tied to your organization and a specific `lab_id`.

## Integration Patterns

1. Reverse Proxy (recommended)  
  - Your app routes users to the hosted UI
  - Backend exchanges API key → JWT, injects `Authorization: Bearer <jwt>` when proxying upstream  
  - Pros: Token not placed in URL; easier to add auth layers & observability

2. Time‑Limited Link (fastest)  
  - Backend mints JWT then 302 redirects user to UI with `?token=` (or `#token=`)  
  - Pros: Minimal changes; Cons: Token visible in browser history → keep TTL short

3. Embed Modal (docs/blog/app surfaces)  
  - Add `<script src="https://subnode1.xyz/embed.js" async></script>` and an `<a data-embed-lab="LAB_ID">`  
  - Script calls `POST /auth/embed/token` (scoped, short TTL) then opens modal iframe  
  - Pros: No redirect; frictionless adoption funnels

## Get a Token (Server‑Side)
```bash
curl -s -X POST {BASE_URL}/auth/token \
  -H 'Content-Type: application/json' \
  -d '{
    "api_key": "sk_live_your_api_key",
    "lab_id": "YOUR_LAB_ID"
  }'
```

### Option A: Reverse Proxy (Node/Express sketch)
```js
// Pseudocode: exchange token, then proxy with Authorization
app.get('/labs/start/:labId', async (req, res) => {
  const labId = req.params.labId;
  const tokenResp = await fetch(`${process.env.BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: process.env.ORG_API_KEY, lab_id: labId })
  }).then(r => r.json());

  // Example: proxy to the hosted UI start endpoint
  // Add Authorization: Bearer <jwt> header in the proxied request
  proxy.web(req, res, {
    target: `${process.env.BASE_URL}`,
    headers: { Authorization: `Bearer ${tokenResp.access_token}` }
  });
});
```

### Option B: Time‑Limited Link (HTTP 302)
```js
// Pseudocode: redirect with token in URL fragment
app.get('/labs/link/:labId', async (req, res) => {
  const labId = req.params.labId;
  const tokenResp = await fetch(`${process.env.BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: process.env.ORG_API_KEY, lab_id: labId })
  }).then(r => r.json());

  // The frontend will strip the token from the URL after decoding.
  const ui = `${process.env.BASE_URL}/?token=${encodeURIComponent(tokenResp.access_token)}`;
  res.redirect(302, ui);
});
```

### Security Tips

- Always mint tokens server‑side; never embed an org API key
- Keep JWT TTL short; scope to single `lab_id`
- Reverse proxy for production; URL tokens & embeds for trials / marketing
- Using an IdP (Auth0): RS256 session can protect portal + service calls directly (skip link tokens)

### Troubleshooting

- Redirect loops → Add Authorization only to upstream proxied requests; don’t re‑proxy static assets recursively
- 401 → Check `lab_id`, token expiry, and that the API key has not been rotated
- Modal embed won’t open → Verify `data-embed-lab` attribute and script loaded (no CSP blockage)