---
id: environment-isolation
title: Environment Isolation & Safeguards
---

<p class="doc-lead">How Lab Thingy keeps each user session isolated: per‑user containers, org namespaces, resource tiers, and practical hardening practices you can extend with Custom Environments.</p>

## What Gets Provisioned

When a user launches a lab, a single short‑lived Linux container (pod) starts (or is briefly reused) with:

- The lab’s base image (preset or your custom image)
- A non‑root user (UID e.g. 10001) and writable home directory
- Ephemeral filesystem (deleted after TTL / inactivity)
- Optional environment variables you specify in the lab definition

No shared volumes, no Docker‑in‑Docker, and no privileged escalation by default.

## Org Namespaces

Each organization is mapped to a dedicated Kubernetes namespace. User pods for that org live only inside that namespace. This logical boundary means:

- Resource quotas can cap aggregate CPU / memory
- You can add ConfigMaps / Secrets scoped to the org
- Cleanup routines can safely reap only that org’s idle pods

Namespace naming: derived from your org id with a stable prefix, avoiding collisions. (Formatting detail abstracted—end users don’t need to manage this.)

## Resource Tiers

Labs reference one of a few predefined tiers (e.g. Small / Medium / Large):

| Tier | Example CPU | Example Memory | Intended Use |
|------|-------------|----------------|--------------|
| Small | 0.5 vCPU | 1 GiB | Quick CLI / SDK tutorials |
| Medium | 1 vCPU | 2 GiB | Multi‑service sample app, light build |
| Large | 2 vCPU | 4 GiB | Heavier build steps, language servers |

Tiers also define a max TTL (time to live) and inactivity timeout. When either expires, the environment is terminated automatically.

## Container-Level Safeguards

Core defaults you get without extra configuration:

- Non‑root user (avoid UID 0 risk)
- Dropped unnecessary Linux capabilities
- No hostPath or privileged mounts
- Network egress limited to common outbound patterns (future: fine‑grained policies)
- Process limits to prevent fork bombs (ulimits tuned conservatively)
- Read‑only base layers once image pulled; only home/work directories writable

## Custom Images: Your Responsibilities

When supplying a custom image, you should:

1. Use a slim base (smaller = faster cold start)
2. Install only required tools & pin versions
3. Create and switch to a non‑root user (avoid `USER root`)
4. Avoid embedding secrets (inject at runtime via environment variables or mounted secrets)
5. Keep image layers minimal (squash extraneous build caches)

Example snippet (non‑root + pinned deps):
```Dockerfile
FROM ubuntu:22.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
  curl ca-certificates git python3 python3-pip && \
  rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir your-sdk==1.2.3
RUN useradd -m -u 10001 labuser
USER labuser
WORKDIR /home/labuser
CMD ["/bin/bash"]
```

## Secrets & Configuration

Keep secrets out of images. Recommended pattern:

1. Define a Kubernetes Secret/ConfigMap (portal helpers or your own tooling)
2. Reference values in environment variables in the lab definition
3. Rotate & revoke by updating the Secret—no image rebuild needed

## Isolation Lifecycle

1. User token validated → a pod is (re)started in the org namespace
2. Terminal attaches only after a readiness probe (simplified) passes
3. Idle timer resets on command execution / file interaction
4. TTL or inactivity reached → pod terminated; ephemeral data lost
5. A fresh launch starts a clean container (no drift carried forward)

## Performance Tips

- Smaller images → quicker first shell (<5s goal for common stacks)
- Pre‑install language servers only if needed (saves memory)
- Cache dependencies in the image, not at runtime
- Limit heavy post‑launch bootstrap scripts; build that into the image instead

## Debugging & Hardening Checklist

| Goal | Check |
|------|-------|
| Not running as root | `whoami` inside container returns non‑root user |
| Minimal image size | `docker image inspect` size within expectations |
| Reproducible builds | All version pins in Dockerfile / lockfiles |
| No secrets baked in | `grep` image layers / review Dockerfile |
| Fast start | Launch lab and time to usable prompt < target |

## Roadmap (User‑Facing)

- User‑visible resource meter (CPU/RAM) in UI
- Org‑scoped network policy editor
- Inline file system snapshot/restore for longer tutorials
- On‑demand elevation sandbox for specific tools (opt‑in)

## See Also

- Quickstart
- Custom Environments
- Generate End‑User Links
- Embedding Labs

If you need deeper infrastructure details (multi‑region, scaling), contact support—those internals are intentionally abstracted from normal usage.
