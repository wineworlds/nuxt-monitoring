// Error-tracking registry: consent, diagnostics context providers, event filters and a
// capture helper. Auto-imported in app (client) and server code.
//
// Deliberately free of any @sentry import: apps can call these functions whether or not
// the module was built with a DSN. Without a DSN nothing registers a capture function,
// so captureAppError() is a no-op and no Sentry code ends up in the bundle.
//
// State lives on globalThis so the Sentry init files and app code share it even if a
// bundler ends up with two copies of this file.

const STATE_KEY = Symbol.for('wineworlds.nuxt-monitoring.sentry')

function state() {
  const g = /** @type {any} */ (globalThis)
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      consent: false,
      contexts: new Map(),
      filters: new Map(),
      capture: null,
    }
  }
  return g[STATE_KEY]
}

const isServer = () => typeof window === 'undefined'
const noop = () => {}

/**
 * Consent of the current visitor to send extended diagnostics (e.g. from a cookie banner).
 * Browser only: on the server one process serves many visitors, so consent stays false.
 * @param {boolean} value
 */
export function setDiagnosticsConsent(value) {
  if (isServer()) return
  state().consent = Boolean(value)
}

/** @returns {boolean} */
export function hasDiagnosticsConsent() {
  return !isServer() && state().consent === true
}

/**
 * Registers a provider for extended diagnostics. It is called for every event, but only
 * while consent is given; its result is merged into the event. Errors in the provider are
 * swallowed. Browser only (on the server a no-op, as the state would be shared between
 * visitors).
 * @param {string} name
 * @param {() => { user?: Record<string, unknown>, tags?: Record<string, string>, contexts?: Record<string, Record<string, unknown>>, extra?: Record<string, unknown> } | null | undefined} provider
 * @returns {() => void} unregister
 */
export function registerDiagnosticsContext(name, provider) {
  if (isServer()) return noop
  const { contexts } = state()
  contexts.set(name, provider)
  return () => {
    if (contexts.get(name) === provider) contexts.delete(name)
  }
}

/**
 * Registers a filter that runs on every event before it is sent (after the built-in
 * scrubbing). Return the (modified) event, or null to drop it.
 * @param {string} name
 * @param {(event: any, hint: any) => any} fn
 * @returns {() => void} unregister
 */
export function registerEventFilter(name, fn) {
  const { filters } = state()
  filters.set(name, fn)
  return () => {
    if (filters.get(name) === fn) filters.delete(name)
  }
}

/**
 * @typedef {{ area?: string, step?: string, level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug', tags?: Record<string, string>, extra?: Record<string, unknown>, fingerprint?: string[] }} CaptureOptions
 */

function capture(kind, value, options) {
  const impl = state().capture
  if (!impl) return
  try {
    impl(kind, value, options ?? {})
  } catch {
    // never let error reporting break the app
  }
}

/**
 * Reports a caught error with tags `area` and `step`. No-op when error tracking is off.
 * @param {unknown} error
 * @param {CaptureOptions} [options]
 */
export function captureAppError(error, options) {
  capture('exception', error, options)
}

/**
 * Reports a message without exception (default level `warning`). No-op when error tracking is off.
 * @param {string} message
 * @param {CaptureOptions} [options]
 */
export function captureAppMessage(message, options) {
  capture('message', message, { level: 'warning', ...options })
}

/** @internal set by the Sentry init files */
export function _setCaptureImpl(fn) {
  state().capture = fn
}

/** @internal used by beforeSend */
export function _getRegistry() {
  const s = state()
  return {
    consent: hasDiagnosticsConsent(),
    contexts: [...s.contexts.values()],
    filters: [...s.filters.values()],
  }
}
