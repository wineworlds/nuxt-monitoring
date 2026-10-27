# @wineworlds/nuxt-monitoring

Nuxt module that exposes Prometheus metrics for the central wineworlds monitoring
(Prometheus + Grafana, see the internal repo `infra-monitoring`).

- Node process: heap, RSS, event loop lag, GC, active handles (`prom-client` default metrics)
- `http_request_duration_seconds{method,status,group}` and `http_requests_in_flight{group}`
- `nuxt_app_info{version,node_version}` as deploy marker
- every series carries the label `app` (default: `name` from the app's `package.json`)

The endpoint (default `/_metrics`) answers only with `Authorization: Bearer <NUXT_MONITORING_TOKEN>`.
Without a token configured it always returns 404.

## Installation

```sh
pnpm add github:wineworlds/nuxt-monitoring#v1.2.1
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@wineworlds/nuxt-monitoring'],
})
```

Token: set `NUXT_MONITORING_TOKEN` in the build environment from the repo secret
`NUXT_METRICS_TOKEN` (org secrets are not available for private repos on our plan, so
the secret is set per repo). It is baked into the server-only runtime config, the client
bundle never sees it. Setting the variable at runtime overrides the baked value.

```yaml
# .github/workflows/…, build step
env:
  NUXT_MONITORING_TOKEN: ${{ secrets.NUXT_METRICS_TOKEN }}
```

`NUXT_MONITORING_APP_NAME` (optional) overrides the `app` label.

## Options

```ts
monitoring: {
  enabled: true,
  path: '/_metrics',
  appName: '',
  // extra request groups by path prefix, merged over api/ipx/assets/internal; rest = ssr
  requestGroups: { shop: ['/shop/'] },
  // 'auto': aggregate all workers when running in PM2 cluster mode with > 1 instance
  cluster: 'auto',
}
```

## PM2 cluster mode

In cluster mode all workers share one port and a scrape reaches a random worker. Every worker
writes a snapshot of its metrics to `$TMPDIR/nuxt-monitoring/<app>/<pid>.json` every 10 s; the
worker that answers the scrape aggregates all snapshots younger than 60 s. Counters and
histograms are summed, `process_start_time_seconds` reports the newest worker start.

## Server utils

```ts
// app-specific metrics
const { client, registry } = useMetrics()
const hits = new client.Counter({ name: 'ipx_cache_hits_total', help: 'IPX cache hits', registers: [registry] })

// request groups with custom logic, returns an unregister function
const unregister = registerRequestGroup('sitemap', (path) => path.startsWith('/sitemap'))
```

Request groups are labels: keep them few. Never use raw paths as labels.

## Releases

Consumers pin a git tag. Bump `version` in `package.json`, commit, `git tag vX.Y.Z`, push with tags.
