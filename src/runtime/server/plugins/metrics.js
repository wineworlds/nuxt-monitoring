import { defineNitroPlugin, useRuntimeConfig } from '#imports'
import { getMetricsState, resolveRequestGroup } from '../utils/metrics.js'

/**
 * Measures every request from arrival until the Node response is closed.
 * Listening on the response (instead of Nitro's afterResponse hook) also
 * covers error pages and aborted requests.
 */
export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig().monitoring
  const { httpDuration, httpInFlight } = getMetricsState(config)

  nitroApp.hooks.hook('request', (event) => {
    const res = event.node?.res
    if (!res || event.path.startsWith(config.path)) return

    const group = resolveRequestGroup(event, config.requestGroups)
    const method = event.method
    const end = httpDuration.startTimer({ method, group })
    httpInFlight.inc({ group })

    res.once('close', () => {
      httpInFlight.dec({ group })
      end({ status: String(res.statusCode) })
    })
  })
})
