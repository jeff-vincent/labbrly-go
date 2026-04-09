---
id: embedding
title: Embedding Labs
---

<p class="doc-lead">Add an interactive lab to any docs page, blog post, marketing site, or in‑app onboarding flow with a single script tag. Users launch a fully isolated container session in a modal—no redirects required.</p>

## Quick Start

```html
<script src="https://subnode1.xyz/embed.js" async></script>
<a data-embed-lab="YOUR_LAB_ID">Open Interactive Lab</a>
```

Clicking the link fetches a short‑lived lab token and opens a fullscreen modal containing the lab UI.

## Attributes

| Attribute | Required | Purpose | Example |
|-----------|----------|---------|---------|
| data-embed-lab | yes | Lab ID to launch | `data-embed-lab="68bdb31..."` |
| data-embed-width | no | Modal width override | `data-embed-width="1000px"` |
| data-embed-height | no | Modal height override | `data-embed-height="720px"` |

If omitted, the modal is 90% of the viewport (max 1200px wide, 95vh tall).

## Framework Wrappers

Minimal wrappers for React, Vue, Svelte, Angular, Solid, Preact, Lit and Alpine are included as commented examples in `test-app/app.html`. They all:
- Ensure the script loads once (idempotent)
- Render an anchor with `data-embed-lab`
- Allow custom link text/styles

Example (React):
```jsx
import { useEffect } from 'react';
const SRC = 'https://subnode1.xyz/embed.js';
export function LabEmbed({ labId, children = 'Open Lab' }) {
  useEffect(() => {
    if (document.querySelector(`script[src="${SRC}"]`)) return;
    const s = document.createElement('script');
    s.src = SRC; s.async = true; document.head.appendChild(s);
  }, []);
  return <a data-embed-lab={labId}>{children}</a>;
}
```

## Token Flow

`embed.js` performs a POST to `/auth/embed/token` with `{ lab_id }`. Response:
```json
{ "access_token": "<jwt>" }
```
The JWT is scoped to that lab and expires quickly. It is inserted into the iframe URL as a query parameter. Inside the iframe the normal lab launch sequence begins (container start, terminal attach, etc.).

## Security Notes

- No org API key appears in the page — the embed token endpoint is public but strictly scoped & rate limited.
- The iframe uses a sandbox attribute to limit page capabilities.
- All code runs in a per‑user container inside an org‑specific namespace (see Environment Isolation & Safeguards) with a non‑root user and enforced resource tier.
- Closing the modal (ESC or backdrop) ends the interactive UI; the container may remain briefly until TTL or inactivity reclaim.

## Custom Domains / Staging

Point the script at staging or self‑hosted domains:
```html
<script src="https://staging.example.com/embed.js?base=https://staging.example.com" async></script>
```
Or supply a data attribute:
```html
<script src="/embed.js" data-subnode-base="https://labs.internal.example" async></script>
```

## Sizing & Responsiveness

Override per link:
```html
<a data-embed-lab="LAB123" data-embed-width="1100px" data-embed-height="680px">Larger Lab</a>
```
On small screens the modal constrains height to keep controls accessible (max 95vh). Width shrinks fluidly.

## Accessibility

- Modal uses `role="dialog"` + `aria-modal="true"`.
- ESC closes; clicking the backdrop closes.
- Planned: focus trap & return focus to trigger link after close.

## Styling

Style the trigger anchor with your existing CSS framework. The modal UI uses isolation (no dependency on your global styles). If you need a button:
```html
<a data-embed-lab="LAB123" class="btn btn-primary">Try It Now</a>
```

## Analytics (Roadmap)

Upcoming `postMessage` events for host pages:
- `lab_started`
- `lab_ready`
- `lab_error`
- `lab_completed`

These will allow you to correlate conversions with your own analytics tools.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Alert: could not load lab | Token request failed | Check lab ID or temporary service status |
| Terminal retries / blank | Container still starting | Wait a few seconds; cold start still pulling image |
| Slow first open | Large custom image | Reduce layers, use slimmer base image |

## Best Practices

- Keep custom images small for faster first interaction.
- Use descriptive link text ("Run the Quickstart" > "Open Lab").
- Place embeds contextually near docs steps so users can try commands immediately.
- Avoid embedding more than one heavy lab on a single page (one modal per task).

## See Also

- Environment Isolation & Safeguards (`environment-isolation`)
- Generate End‑User Links (`get-user-link`)
- Custom Environments (`custom-environments`)
- Quickstart (`quickstart`)
