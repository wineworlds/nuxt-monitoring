# Changelog

## v1.3.0

- Optional error tracking via GlitchTip (Sentry-compatible) with `@sentry/nuxt` 11.8.0:
  active only when `NUXT_PUBLIC_SENTRY_DSN` (build env) or `monitoring.sentry.dsn` is set.
  Server and browser errors, no traces, no replay, no source map upload, `sendDefaultPii: false`.
  `environment` from `NUXT_PUBLIC_SENTRY_ENVIRONMENT` (default `production`),
  `release` = `<appName>@<version>`. No `sentry.*.config` file and no `node --import` needed.
  Without a DSN the build output is unchanged.
- New dependency `@sentry/nuxt` (exact pin). Requires Node >= 20.19 / 22.12.

## v1.2.1

- Use `nuxt/kit` from the host app instead of an own `@nuxt/kit`.

## v1.2.0

- Aggregate metrics across PM2 cluster workers, finer SSR buckets.

## v1.1.0

- Take `NUXT_MONITORING_TOKEN` from the build environment.

## v1.0.0

- Prometheus metrics module for Nuxt apps.
