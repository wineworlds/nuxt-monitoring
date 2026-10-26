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
pnpm add github:wineworlds/nuxt-monitoring#v1.1.0
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@wineworlds/nuxt-monitoring'],
})
```

Token: set `NUXT_MONITORING_TOKEN` in the build environment (GitHub org secret
`NUXT_MONITORING_TOKEN`). It is baked into the server-only runtime config, the client
bundle never sees it. Setting the variable at runtime overrides the baked value.

```yaml
# .github/workflows/…, build step
env:
  NUXT_MONITORING_TOKEN: ${{ secrets.NUXT_MONITORING_TOKEN }}
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
}
```

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
