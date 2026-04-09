---
title: Custom Environments
---

Ship labs on top of your own Docker images so users see the exact tools and versions your product requires—while retaining the platform’s per‑user isolation and auto‑reclaim. Available on Business & Premium plans.

## 1. Create a Base Image

- Start from a slim official image (python, node, ubuntu, alpine, etc.)
- Install only required CLIs / SDKs / language servers
- Add sample assets (optionally clone a public repo)
- Create & switch to a non‑root user (avoid UID 0)

Example Dockerfile
```Dockerfile
FROM ubuntu:22.04

# System deps
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    curl ca-certificates git python3 python3-pip && \
    rm -rf /var/lib/apt/lists/*

# App deps (example)
RUN pip3 install --no-cache-dir your-sdk==1.2.3

# Non-root user
RUN useradd -m -u 10001 labuser
USER labuser
WORKDIR /home/labuser

# Optional: preload repo or samples
# RUN git clone https://github.com/yourorg/your-samples samples

# Default command for interactive terminals
CMD [ "/bin/bash" ]
```

Build and push
```bash
docker build -t registry.example.com/yourorg/lab-base:1.0.0 .
docker push registry.example.com/yourorg/lab-base:1.0.0
```

## 2. Reference the Image

- In Create/Edit Lab set Container Image to your pushed tag (else choose preset)
- IDE Run & Terminal sessions operate inside this image
- Resource tier still enforces CPU / memory / TTL (image does not override tier caps)

Example (conceptual)
```json
{
  "name": "Getting Started with Your Product",
  "image": "registry.example.com/yourorg/lab-base:1.0.0",
  "cpu": "500m",
  "memory": "1Gi",
  "ttl_seconds": 1800,
  "env": {
    "YOUR_API_BASE_URL": "https://api.yourproduct.com"
  }
}
```

## 3. Provide Secrets Securely

- Do NOT bake credentials into the image
- Use namespace tools / K8s Secrets & ConfigMaps (scoped per org)
- Inject via environment variables (lab definition) or mounted files
- Rotate by updating the Secret → no image rebuild needed

## 4. Harden & Optimize

- Minimize size; pin versions (deterministic builds)
- Drop unnecessary Linux capabilities
- Expose only required ports; prefer terminal + run for simple flows
- Add health checks if you run a long‑lived service (web preview)
- Keep layer count low; clear build caches

## 5. Test & Roll Out

1. Local test: `docker run -it --rm <image>`  
2. Create a staging lab → verify terminal connect, code run, (video/scoring)  
3. Optimize cold start (size < target)  
4. Promote to production labs  

Troubleshooting
- Image pull errors: verify registry credentials and image visibility from your cluster.
- Terminal connection retries: the UI auto‑retries while the pod starts.
- Startup timeouts: reduce image size or pre‑pull images on nodes.
- Permission issues: ensure files are owned by the non‑root user and writable where needed.

## Premium Tips

- Custom Envs → Images: edit Dockerfile templates & upload support files
- Custom Envs → Namespace: craft Secrets/ConfigMaps, inspect namespace resources

## Best Practices Checklist

| Goal | Check |
|------|-------|
| Non‑root execution | Dockerfile sets USER to non‑root UID |
| Deterministic deps | Versions pinned / lockfiles added |
| Fast cold start | Image size meets target (< e.g. 1GB compressed) |
| No embedded secrets | Scan layers (`docker history`, `trivy`) |
| Minimal capabilities | No need for privileged / host mounts |

## See Also

- Environment Isolation & Safeguards (container boundaries)
- Quickstart (overall flow)
- Embedding Labs (one‑line modal launcher)
