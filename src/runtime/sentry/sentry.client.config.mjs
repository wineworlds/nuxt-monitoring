// Loaded by @sentry/nuxt (option `configDir`) only when the module found a DSN at build time.
// Runs inside a Nuxt plugin, so the public runtime config is available.
import * as Sentry from '@sentry/nuxt'
import { useRuntimeConfig } from '#imports'

const { dsn, environment, release } = useRuntimeConfig().public.sentry ?? {}

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,
    // errors only: no performance traces, no session replay, no PII
    tracesSampleRate: 0,
    sendDefaultPii: false,
  })
}
