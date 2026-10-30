// Bundled into the Nitro server by @sentry/nuxt (option `configDir`) and evaluated at
// server start, no `node --import` needed. Only present when a DSN was set at build time.
import * as Sentry from '@sentry/nuxt'
import { useRuntimeConfig } from '#imports'

const { dsn, environment, release } = useRuntimeConfig().public.sentry ?? {}

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,
    // errors only: no performance traces, no PII
    tracesSampleRate: 0,
    sendDefaultPii: false,
  })
}
