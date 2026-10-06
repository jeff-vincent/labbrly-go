# Configuring GH Actions for kindling: dev loop → CI-first → multi-tenant staging → GitOps

This walks through wiring up the full flow these recent kindling features were
built toward: dev locally with best-practice guardrails, CI-first from the
first push, graduate to a shared staging cluster with zero collisions between
branches, then hand off a production-ready Helm chart at the git boundary.

Grounded directly in the kindling source (`cli/cmd/snapshot.go`,
`internal/controller/cirunnerpool_controller.go`, the composite actions under
`.github/actions/`) as of the `kindling-sh/kindling` `main` branch, including
[PR #47](https://github.com/kindling-sh/kindling/pull/47) (`spec.buildAgentEnv`
plus the `kindling runners --enable-snapshot-deploy`/`--build-agent-env`
flags) — confirm that PR is merged before following step 3 below, or those
flags won't exist yet and the registry-credentials env vars won't reach the
sidecar.

## 0. What you're wiring together

- **`CIRunnerPool`** — a self-hosted GH Actions runner + `build-agent` sidecar
  living in your local Kind cluster. The sidecar watches a shared `/builds`
  volume for signal files and does all the actual kubectl/Kaniko/Helm work.
- **`kindling-build` / `kindling-deploy`** — dev-loop CI: build via Kaniko,
  deploy to your local cluster, on every push. This is the "CI-first"
  mentality — there's no separate "local Docker build" path, every build goes
  through the same CI pipeline that would run anywhere else.
- **`kindling-snapshot-deploy`** — graduates to a shared, multi-tenant staging
  cluster non-interactively, from that same self-hosted runner. Branch-scoped
  naming/namespacing means concurrent PR branches never collide on the same
  cluster.
- **`--render-prod-values`** — hands off a credential-free, digest-pinned
  Helm chart for a GitOps controller (Argo CD, Flux, etc.) to pick up at the
  git boundary. kindling never touches production itself.

## 1. Prerequisites

```bash
kindling init                       # bootstrap the local Kind cluster (default name: "dev")
```

You also need:

- A staging Kubernetes cluster with its own kubeconfig context (not a `kind-*`
  context — `kindling snapshot --deploy` explicitly rejects those).
- A container registry the staging cluster can pull from (ghcr.io, ECR,
  Docker Hub, etc.) — the in-cluster `registry:5000` dev registry doesn't
  count, it's not reachable from outside your laptop.
- `helm` and `crane` installed locally if you want to run any of this
  interactively first, before wiring it into CI.

## 2. Create the registry credentials Secret (in your local cluster)

This Secret is what `spec.buildAgentEnv` (step 3) will reference — it's never
read directly by kindling, just the source for the env vars the sidecar
needs.

```bash
kubectl --context kind-dev create secret generic registry-credentials \
  --from-literal=username=<your-registry-username> \
  --from-literal=password=<your-registry-password-or-token>
```

## 3. Register the runner with snapshot-deploy enabled

```bash
kindling runners -u <github-username> -r <owner/repo> -t <github-pat> \
  --enable-snapshot-deploy \
  --build-agent-env KINDLING_REGISTRY_USERNAME=registry-credentials:username \
  --build-agent-env KINDLING_REGISTRY_PASSWORD=registry-credentials:password
```

(Requires [PR #47](https://github.com/kindling-sh/kindling/pull/47),
which added these flags — confirm it's merged into `main` first. Before
that PR, this required a manual `kubectl patch` after `kindling runners`.)

Notes:

- `spec.localClusterName` is set automatically from this command's
  `--cluster` (default `dev`) — no separate flag needed, it must always
  match exactly what `kindling init` named your cluster, since the
  sidecar uses it to synthesize a `kind-<name>` kubeconfig context for
  its own local-registry access, alongside the staging context it
  merges in per-request.
- `--build-agent-env NAME=SECRET:KEY` is repeatable. `spec.env` on this
  CR only reaches the `runner` container, never `build-agent` — that's
  why registry credentials have to go through `--build-agent-env`
  specifically.
- Confirm the rollout picked up the new image before moving on:

  ```bash
  kubectl --context kind-dev get deploy -l apps.example.com/github-username=<github-username> -w
  kubectl --context kind-dev get pod -l apps.example.com/github-username=<github-username> \
    -o jsonpath='{.items[0].spec.containers[?(@.name=="build-agent")].image}'
  # should print: ghcr.io/kindling-sh/build-agent:latest  (not bitnami/kubectl:latest)
  ```

## 4. Staging kubeconfig as a GH Actions secret

```bash
kubectl config view --minify --flatten --context=<your-staging-context> > staging.kubeconfig
gh secret set STAGING_KUBECONFIG < staging.kubeconfig
rm staging.kubeconfig
```

This is the only place the staging cluster's credentials exist outside your
own kubeconfig — GitHub redacts it from job logs, and the sidecar removes
both the raw and merged copies immediately after every `kindling snapshot`
invocation, success or failure.

## 5. (Optional) `--creds-config` for staging-specific credentials

Only needed for credentials that must differ from their dev-cluster value —
anything not listed here falls back to the dev default automatically, with
no prompt:

```yaml
# deploy/staging-credentials.yaml — commit this, no literal secrets inside
credentials:
  DATABASE_URL:
    fromEnv: STAGING_DATABASE_URL
```

If you use `fromEnv`, that same env var name also needs a `buildAgentEnv`
entry on the `CIRunnerPool` (step 3), backed by its own `secretKeyRef` — same
reason as the registry credentials: the sidecar process needs it in its own
environment, it can't inherit anything from the triggering workflow run.

## 6. The workflow

```yaml
# .github/workflows/dev-deploy.yml
name: Dev Deploy
on:
  push:
    branches: ["**"]
  workflow_dispatch:

env:
  REGISTRY: "registry:5000"
  TAG: "${{ github.actor }}-${{ github.sha }}"

jobs:
  build-and-deploy:
    runs-on: [self-hosted, "${{ github.actor }}"]
    steps:
      - uses: actions/checkout@v4

      - uses: kindling-sh/kindling/.github/actions/kindling-build@main
        with:
          name: my-app
          context: ${{ github.workspace }}
          image: "${{ env.REGISTRY }}/my-app:${{ env.TAG }}"

      - uses: kindling-sh/kindling/.github/actions/kindling-deploy@main
        with:
          name: "${{ github.actor }}-my-app"
          image: "${{ env.REGISTRY }}/my-app:${{ env.TAG }}"
          port: "8080"
          ingress-host: "${{ github.actor }}-my-app.localhost"

  staging-deploy:
    needs: build-and-deploy
    if: github.ref == 'refs/heads/main'
    runs-on: [self-hosted, "${{ github.actor }}"]
    steps:
      - uses: kindling-sh/kindling/.github/actions/kindling-snapshot-deploy@main
        with:
          name: staging-${{ github.run_id }}
          registry: ghcr.io/myorg
          staging-context: staging
          staging-kubeconfig: ${{ secrets.STAGING_KUBECONFIG }}
          extra-args: "--creds-config deploy/staging-credentials.yaml --render-prod-values"
```

Adjust `name`/`context`/`image`/`port`/`ingress-host` per service — add one
`kindling-build` + `kindling-deploy` step pair per service for a
multi-service project (see `examples/microservices/.github/workflows/dev-deploy.yml`
in the kindling repo for a multi-service reference with selective rebuilds).

## 7. Verify

- `kindling status` — confirms the dev-loop deploy worked
- The `staging-deploy` job log — look for `✅ <name> deployed`
- `kubectl --context staging -n <branch-slug> get pods` — confirms the
  staging deploy actually landed
- Check the exported chart's output directory for `values-prod.yaml` (the
  GitOps handoff artifact) and `MISSING_CREDENTIALS.md` (only appears if
  something had no resolvable value anywhere — never fails the deploy, just
  warns)

## 8. (Optional) TLS on the staging cluster

```bash
kindling staging tls \
  --context staging \
  --domain app.example.com \
  --email you@example.com
```

See the [graduation guide](https://kindling.sh/docs/graduation) for the
wildcard-DNS/multi-branch variant (`--wildcard`) if this staging cluster is
shared across multiple concurrent branch deployments with real,
resolvable hostnames.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `staging-deploy` hangs until `timeout` | `CIRunnerPool` doesn't have `enableSnapshotDeploy: true`, or the patch in step 3 didn't apply — check the `build-agent` image per step 3's verification command |
| `helm upgrade --install` fails with an auth error against the registry | `buildAgentEnv` missing or pointing at the wrong Secret/key — remember `spec.env` does **not** reach `build-agent` |
| A credential resolves to the dev value when you expected a `--creds-config` override | Check the exact env var name matches `stagingCredEntry.EnvVarName` (e.g. `DATABASE_URL`, not a service-specific name) |
| `context "kind-dev" looks like a Kind cluster` error | You passed the local cluster's context to `--context`/`staging-context` instead of the real staging cluster's context |
| `MISSING_CREDENTIALS.md` lists a credential you expected to be covered | The `fromEnv` env var wasn't actually set in the `build-agent` container — re-check the `buildAgentEnv` `secretKeyRef` name/key |

