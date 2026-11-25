// Shared init options for the client and server config, without importing @sentry itself
// (the config files pass their Sentry namespace in).
import { _getRegistry, _setCaptureImpl } from './registry.mjs'
import { processEvent } from './process-event.mjs'

/**
 * @param {any} Sentry namespace of @sentry/nuxt
 * @param {{ dsn: string, environment?: string, release?: string, breadcrumbs?: 'always' | 'consent' | 'never' }} config
 */
export function initSentry(Sentry, config) {
  const breadcrumbs = config.breadcrumbs || 'always'

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    // errors only: no performance traces, no session replay, no PII (no IP, cookies, headers)
    tracesSampleRate: 0,
    sendDefaultPii: false,
    ...(breadcrumbs === 'never' ? { maxBreadcrumbs: 0 } : {}),
    beforeSend: (event, hint) => processEvent(event, hint, { ..._getRegistry(), breadcrumbs }),
  })

  _setCaptureImpl((kind, value, { area, step, level, tags, extra, fingerprint }) => {
    Sentry.withScope((scope) => {
      if (area) scope.setTag('area', area)
      if (step) scope.setTag('step', step)
      if (tags) scope.setTags(tags)
      if (extra) scope.setExtras(extra)
      if (level) scope.setLevel(level)
      if (fingerprint?.length) scope.setFingerprint(fingerprint)
      if (kind === 'message') Sentry.captureMessage(String(value))
      else Sentry.captureException(value)
    })
  })
}
