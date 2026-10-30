/**
 * Prometheus metrics for Nuxt apps.
 *  - Node process metrics (heap, RSS, event loop lag, GC, handles) via prom-client
 *  - Request duration + in-flight requests per request group (ssr, api, ipx, …)
 *  - PM2 cluster mode: workers share snapshots, the scraped worker reports the sum
 *  - Bearer-token protected endpoint (default /_metrics), scraped by the central
 *    Prometheus (wineworlds/infra-monitoring)
 *
 * Optional error tracking (GlitchTip / Sentry): only when a DSN is set at build time
 * (NUXT_PUBLIC_SENTRY_DSN or monitoring.sentry.dsn) @sentry/nuxt is installed into the
 * build. Without a DSN no Sentry code ends up in the bundle.
 *
 * Server utils (auto-imported): useMetrics(), registerRequestGroup()
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  addServerHandler,
  addServerImports,
  addServerPlugin,
  addVitePlugin,
  createResolver,
  defineNuxtModule,
  installModule,
} from 'nuxt/kit'

/** @type {Record<string, string[]>} */
const defaultRequestGroups = {
  api: ['/api/'],
  ipx: ['/_ipx/'],
  assets: ['/_nuxt/', '/_fonts/'],
  internal: ['/__nuxt'],
}

function readAppPackage(rootDir) {
  try {
    return JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'))
  } catch {
    return {}
  }
}

export default defineNuxtModule({
  meta: {
    name: '@wineworlds/nuxt-monitoring',
    configKey: 'monitoring',
  },
  defaults: {
    enabled: true,
    path: '/_metrics',
    appName: '',
    requestGroups: {},
    cluster: 'auto',
    sentry: {
      dsn: '',
      environment: '',
    },
  },
  async setup(options, nuxt) {
    if (!options.enabled) return

    const { resolve } = createResolver(import.meta.url)
    const pkg = readAppPackage(nuxt.options.rootDir)

    // NUXT_MONITORING_TOKEN / NUXT_MONITORING_APP_NAME override at runtime; a token present
    // at build time (CI secret) is baked into the server-only runtime config
    const existing = nuxt.options.runtimeConfig.monitoring ?? {}
    const appName = options.appName || pkg.name || 'nuxt'
    nuxt.options.runtimeConfig.monitoring = {
      token: process.env.NUXT_MONITORING_TOKEN || '',
      appName,
      appVersion: pkg.version || '',
      path: options.path,
      requestGroups: { ...defaultRequestGroups, ...options.requestGroups },
      cluster: options.cluster,
      ...existing,
    }

    addServerImports([
      { name: 'useMetrics', from: resolve('./runtime/server/utils/metrics') },
      { name: 'registerRequestGroup', from: resolve('./runtime/server/utils/metrics') },
    ])
    addServerPlugin(resolve('./runtime/server/plugins/metrics'))
    addServerHandler({
      route: options.path,
      method: 'get',
      handler: resolve('./runtime/server/routes/metrics'),
    })

    await setupSentry(options.sentry ?? {}, nuxt, {
      release: pkg.version ? `${appName}@${pkg.version}` : appName,
      configDir: resolve('./runtime/sentry'),
    })
  },
})

/**
 * Error tracking via @sentry/nuxt, only when a DSN is known at build time. The SDK init
 * files live in this module (runtime/sentry), the app needs no sentry.*.config file.
 * The server config is bundled into the Nitro build and runs at server start, so no
 * `node --import` is needed.
 */
async function setupSentry(options, nuxt, { release, configDir }) {
  const dsn = process.env.NUXT_PUBLIC_SENTRY_DSN || options.dsn || ''
  if (!dsn) return

  // NUXT_PUBLIC_SENTRY_* override at runtime
  nuxt.options.runtimeConfig.public.sentry = {
    ...nuxt.options.runtimeConfig.public.sentry,
    dsn,
    environment: process.env.NUXT_PUBLIC_SENTRY_ENVIRONMENT || options.environment || 'production',
    release,
  }

  // client: drop the tracing and debug code paths of the SDK (errors only)
  addVitePlugin(
    {
      name: 'wineworlds-monitoring:sentry-defines',
      config: () => ({ define: { __SENTRY_TRACING__: 'false', __SENTRY_DEBUG__: 'false' } }),
    },
    { server: false },
  )

  // resolved from this package, the app does not depend on @sentry/nuxt itself
  const { default: sentryModule } = await import('@sentry/nuxt/module')
  // options under the app's own `sentry` key still apply (merged under these)
  await installModule(sentryModule, {
    configDir,
    sourcemaps: { disable: true },
    telemetry: false,
    buildTimeInstrumentation: false,
  })
}
