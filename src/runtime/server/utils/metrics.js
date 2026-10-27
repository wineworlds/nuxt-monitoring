import client from 'prom-client'
import { useRuntimeConfig } from '#imports'
import { isClusterMode, startSnapshots } from './cluster.js'

// One registry per process, kept on globalThis so dev HMR does not register metrics twice
const STATE = Symbol.for('wineworlds.nuxt-monitoring')

/** @type {Map<string, (path: string, event: import('h3').H3Event) => boolean>} */
const requestGroups = new Map()

function createState(config) {
  const registry = new client.Registry()
  registry.setDefaultLabels({ app: config.appName })
  client.collectDefaultMetrics({ register: registry })
  // cluster aggregation would omit it; the newest start keeps worker restarts visible
  registry.getSingleMetric('process_start_time_seconds').aggregator = 'max'

  new client.Gauge({
    name: 'nuxt_app_info',
    help: 'App version and runtime (constant 1), useful as deploy marker',
    labelNames: ['version', 'node_version'],
    aggregator: 'first',
    registers: [registry],
  }).set({ version: config.appVersion || 'unknown', node_version: process.version }, 1)

  const clustered = isClusterMode(config.cluster)
  if (clustered) startSnapshots(registry, config.appName)

  return {
    registry,
    clustered,
    httpDuration: new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests until the response is closed',
      labelNames: ['method', 'status', 'group'],
      buckets: [0.025, 0.05, 0.075, 0.1, 0.15, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    }),
    httpInFlight: new client.Gauge({
      name: 'http_requests_in_flight',
      help: 'HTTP requests currently being handled',
      labelNames: ['group'],
      registers: [registry],
    }),
  }
}

export function getMetricsState(config) {
  globalThis[STATE] ??= createState(config)
  return globalThis[STATE]
}

/**
 * Access the shared registry to add app-specific metrics:
 *   const { client, registry } = useMetrics()
 *   const hits = new client.Counter({ name: 'ipx_cache_hits_total', help: '…', registers: [registry] })
 */
export function useMetrics() {
  return { client, registry: getMetricsState(useRuntimeConfig().monitoring).registry }
}

/**
 * Adds a request group (label `group`) that is checked before the configured prefix groups.
 * Returns a function that removes it again.
 */
export function registerRequestGroup(name, match) {
  requestGroups.set(name, match)
  return () => {
    if (requestGroups.get(name) === match) requestGroups.delete(name)
  }
}

export function resolveRequestGroup(event, prefixGroups) {
  const path = event.path
  for (const [name, match] of requestGroups) {
    if (match(path, event)) return name
  }
  for (const [name, prefixes] of Object.entries(prefixGroups)) {
    if (prefixes.some((prefix) => path.startsWith(prefix))) return name
  }
  return 'ssr'
}
