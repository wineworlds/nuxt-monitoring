/**
 * Prometheus metrics for Nuxt apps.
 *  - Node process metrics (heap, RSS, event loop lag, GC, handles) via prom-client
 *  - Request duration + in-flight requests per request group (ssr, api, ipx, …)
 *  - Bearer-token protected endpoint (default /_metrics), scraped by the central
 *    Prometheus (wineworlds/infra-monitoring)
 *
 * Server utils (auto-imported): useMetrics(), registerRequestGroup()
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  addServerHandler,
  addServerImports,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'

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
  },
  setup(options, nuxt) {
    if (!options.enabled) return

    const { resolve } = createResolver(import.meta.url)
    const pkg = readAppPackage(nuxt.options.rootDir)

    // token + app name are runtime values: NUXT_MONITORING_TOKEN, NUXT_MONITORING_APP_NAME
    const existing = nuxt.options.runtimeConfig.monitoring ?? {}
    nuxt.options.runtimeConfig.monitoring = {
      token: '',
      appName: options.appName || pkg.name || 'nuxt',
      appVersion: pkg.version || '',
      path: options.path,
      requestGroups: { ...defaultRequestGroups, ...options.requestGroups },
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
  },
})
