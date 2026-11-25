// Loaded by @sentry/nuxt (option `configDir`) only when the module found a DSN at build time.
// Runs inside a Nuxt plugin, so the public runtime config is available.
import * as Sentry from '@sentry/nuxt'
import { useRuntimeConfig } from '#imports'
import { initSentry } from './setup.mjs'

const config = useRuntimeConfig().public.sentry ?? {}

if (config.dsn) initSentry(Sentry, config)
