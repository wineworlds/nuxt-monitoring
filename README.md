# @wineworlds/nuxt-monitoring

Nuxt module that exposes Prometheus metrics for the central wineworlds monitoring
(Prometheus + Grafana, see the internal repo `infra-monitoring`).

- Node process: heap, RSS, event loop lag, GC, active handles (`prom-client` default metrics)
- `http_request_duration_seconds{method,status,group}` and `http_requests_in_flight{group}`
- `nuxt_app_info{version,node_version}` as deploy marker
- every series carries the label `app` (default: `name` from the app's `package.json`)
- optional: server and browser errors to GlitchTip (see [Error tracking](#fehler-tracking-glitchtip))

The endpoint (default `/_metrics`) answers only with `Authorization: Bearer <NUXT_MONITORING_TOKEN>`.
Without a token configured it always returns 404.

## Installation

```sh
pnpm add github:wineworlds/nuxt-monitoring#v1.4.0
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

## Fehler-Tracking (GlitchTip)

Optional: server and browser errors go to GlitchTip (https://glitchtip.wineworlds.de,
Sentry-compatible) via `@sentry/nuxt`. It is **only active when a DSN is set at build time**.
Without a DSN no Sentry code is bundled and nothing changes.

Setup per app:

1. GlitchTip: create a project (platform *Vue*/*JavaScript*) in the wineworlds organisation and copy its DSN.
2. GitHub repo → Settings → Secrets and variables → Actions → **Variables**: `SENTRY_DSN` = the DSN
   (a DSN is not secret, it ends up in the browser anyway).
3. Pass it to the build step:

```yaml
# .github/workflows/…, build step
env:
  NUXT_METRICS_TOKEN: ${{ secrets.NUXT_METRICS_TOKEN }}  # as above
  NUXT_PUBLIC_SENTRY_DSN: ${{ vars.SENTRY_DSN }}
  # NUXT_PUBLIC_SENTRY_ENVIRONMENT: staging             # default: production
```

Alternatively `monitoring: { sentry: { dsn: '…', environment: 'staging' } }` in `nuxt.config.ts`
(the build env wins).

What is sent:

- unhandled server errors (Nitro/SSR/API) and browser errors (Vue, `app:error`); 3xx/4xx `createError`s are ignored
- `environment` = `NUXT_PUBLIC_SENTRY_ENVIRONMENT` (default `production`),
  `release` = `<appName>@<version>` from the app's `package.json`
- no performance traces (`tracesSampleRate: 0`, tracing code tree-shaken from the client),
  no session replay, no source map upload, `sendDefaultPii: false`
- built-in scrubbing before every send (client and server): e-mail addresses → `[email]` in
  message, exception values, request URL/query/body, tags, extra, contexts and breadcrumbs;
  request headers reduced to an allowlist (`host`, `user-agent`, `accept`, `accept-language`,
  `content-type`, `content-length`, `referer` without query, `x-forwarded-proto`), so no
  `x-forwarded-for` / `x-real-ip` / cookies / tokens; no request cookies; query strings removed
  from fetch/xhr/navigation breadcrumbs; `user.email` and `user.ip_address` always removed;
  without diagnostics consent no `user` at all

The app does **not** need `sentry.client.config.ts` / `sentry.server.config.ts` or a
`node --import` flag: the module brings both init files, the server init is bundled into
`.output/server` and runs at server start (`node .output/server/index.mjs` as before).
`NUXT_PUBLIC_SENTRY_DSN` / `NUXT_PUBLIC_SENTRY_ENVIRONMENT` at runtime override the baked
values, but cannot switch Sentry on for a build made without DSN. Further `@sentry/nuxt`
build options can go under the app's own `sentry` key in `nuxt.config.ts`.

Cost with DSN: client JS +~110 kB (+~40 kB gzip), `.output/server` +~5 MB (`@sentry/node`, OpenTelemetry).

### App API (auto-imported, v1.4.0)

Available with and without DSN. Without DSN they are no-ops and no Sentry code is bundled,
so apps never need to import `@sentry/nuxt` themselves.

```ts
// app + server
captureAppError(error: unknown, options?: CaptureAppErrorOptions): void
captureAppMessage(message: string, options?: CaptureAppErrorOptions): void // default level 'warning'
registerEventFilter(name: string, fn: (event, hint) => event | null): () => void

// app (browser) only – on the server no-ops, consent is always false there
setDiagnosticsConsent(value: boolean): void
hasDiagnosticsConsent(): boolean
registerDiagnosticsContext(name: string, provider: () => DiagnosticsContext | null | undefined): () => void

interface CaptureAppErrorOptions {
  area?: string           // tag `area`, e.g. 'checkout'
  step?: string           // tag `step`, e.g. 'place-order'
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug'
  tags?: Record<string, string>
  extra?: Record<string, unknown>
  fingerprint?: string[]  // custom grouping
}
interface DiagnosticsContext {
  user?: Record<string, unknown>   // e.g. { id: customerNumber }; email / ip_address are removed
  tags?: Record<string, string>
  contexts?: Record<string, Record<string, unknown>>
  extra?: Record<string, unknown>
}
```

Order in `beforeSend`: diagnostics context (only with consent) → built-in scrubbing →
breadcrumb mode → event filters (in registration order; return `null` to drop). A provider or
filter that throws is skipped. `register…` with an existing name replaces the entry; the returned
function only removes its own registration.

Breadcrumbs (clicks, navigation, fetch/xhr, console) are controlled by
`monitoring.sentry.breadcrumbs` or build env `NUXT_PUBLIC_SENTRY_BREADCRUMBS`:
`'always'` (default), `'consent'` (only with diagnostics consent) or `'never'`.

#### Consent from the cookie banner (`@dargmuesli/nuxt-cookie-control`)

```ts
// nuxt.config.ts
monitoring: { sentry: { breadcrumbs: 'consent' } },
cookieControl: {
  cookies: {
    optional: [{
      id: 'diagnostics',
      name: 'Fehlerdiagnose',
      description: 'Bei einem Fehler senden wir zusätzlich Kundennummer, Warenkorb, Lieferland, Kundengruppe und die letzten Klicks an unser eigenes Fehler-Tracking.',
    }],
  },
},
```

```ts
// plugins/diagnostics.client.ts
export default defineNuxtPlugin(() => {
  const { cookiesEnabledIds } = useCookieControl()
  watch(
    () => cookiesEnabledIds.value?.includes('diagnostics') ?? false,
    (enabled) => setDiagnosticsConsent(enabled),
    { immediate: true },
  )

  // read lazily at event time, only called with consent
  registerDiagnosticsContext('customer', () => ({
    user: { id: customerNumber() },
    tags: { country: shippingCountry(), customerGroup: customerGroup() },
    contexts: { cart: cartSummary() },
  }))
})
```

Revoking consent takes effect with the next event; nothing is stored in the browser by the
error tracking itself.

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

See [CHANGELOG.md](CHANGELOG.md). Consumers pin a git tag. Bump `version` in `package.json`, commit, `git tag vX.Y.Z`, push with tags.
