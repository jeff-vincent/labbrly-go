---
id: pricing
title: Pricing
---

<p class="doc-lead">Early Access: focus is feedback, not revenue. Baseline usage is free within fair limits; metered pricing activates closer to GA.</p>

## Current (Early Access)

- Core lab features (IDE, Terminal, Video, Scoring) — $0 platform fee
- Reasonable concurrency & runtime included (soft cap; we’ll contact before throttling)
- Custom images & namespace tools may be selectively enabled

## Coming (Preview Model – Subject to Change)

| Tier | Approx Resources | Intended Use | Indicative Billing Basis* |
|------|------------------|--------------|---------------------------|
| Small | ~0.5 vCPU / 1 GiB | Quick tutorials, SDK intros | Per 30m active slice |
| Medium | ~1 vCPU / 2 GiB | Multi‑step sample apps | Per 30m active slice |
| Large | ~2 vCPU / 4 GiB | Heavier builds / language servers | Per 30m active slice |

*Indicative only. Final unit pricing & allowances will be published pre‑GA.

## Planned Controls

- Monthly spend guardrail (soft + hard cap)
- Overflow policies: Block (default) / Allow + Alert / Queue
- Usage export for internal chargeback / analytics

## Cost Hygiene Tips

- Use the smallest tier that achieves acceptable cold start & run performance
- Keep custom images slim to reduce active time waiting for pulls
- Set sensible TTLs; avoid very long inactivity windows

## FAQ (Pricing)

| Question | Answer |
|----------|--------|
| Will early adopters get discounts? | Early access orgs receive transition credits when pricing turns on. |
| How is “active” defined? | Container running + user interaction or recent process activity (exact spec published pre‑GA). |
| Are tokens billed separately? | No. Billing focuses on container runtime tiers. |

## Roadmap Notifications

You’ll receive email & in‑app notice at least 30 days prior to any pricing activation or change during the early access period.

For detailed spend modeling or procurement needs, reach out via support once you near consistent high concurrency.
