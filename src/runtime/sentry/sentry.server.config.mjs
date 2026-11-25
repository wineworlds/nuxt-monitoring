// Bundled into the Nitro server by @sentry/nuxt (option `configDir`) and evaluated at
// server start, no `node --import` needed. Only present when a DSN was set at build time.
// Consent and diagnostics context are browser-only; scrubbing and filters apply here too.
import * as Sentry from '@sentry/nuxt'
import { useRuntimeConfig } from '#imports'
import { initSentry } from './setup.mjs'

const config = useRuntimeConfig().public.sentry ?? {}

if (config.dsn) initSentry(Sentry, config)
