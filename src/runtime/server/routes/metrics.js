import { timingSafeEqual } from 'node:crypto'
import { createError, defineEventHandler, getHeader, setHeader, useRuntimeConfig } from '#imports'
import { aggregatedMetrics } from '../utils/cluster.js'
import { getMetricsState } from '../utils/metrics.js'

function isAuthorized(header, token) {
  if (!token || !header) return false
  const expected = Buffer.from(`Bearer ${token}`)
  const actual = Buffer.from(header)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// Without NUXT_MONITORING_TOKEN the endpoint does not exist from the outside (404)
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event).monitoring
  if (!isAuthorized(getHeader(event, 'authorization'), config.token)) {
    throw createError({ statusCode: 404 })
  }

  const { registry, clustered } = getMetricsState(config)
  const output = clustered ? await aggregatedMetrics(registry, config.appName) : registry
  setHeader(event, 'content-type', registry.contentType)
  setHeader(event, 'cache-control', 'no-store')
  return output.metrics()
})
