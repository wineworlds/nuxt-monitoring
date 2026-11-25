// beforeSend pipeline, free of any @sentry import (testable in plain Node).
//
// Order: consent context → built-in scrubbing → breadcrumb mode → app filters.
// The scrubbing also runs over the consent context, so an e-mail address never leaves the
// browser, even with consent.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
const MAX_DEPTH = 6
// request headers that may be sent; everything else (x-forwarded-for, x-real-ip, cookie,
// authorization, app tokens, …) is dropped. The server SDK sends forwarded IPs even with
// sendDefaultPii: false.
const ALLOWED_HEADERS = new Set([
  'host',
  'user-agent',
  'accept',
  'accept-language',
  'content-type',
  'content-length',
  'referer',
  'x-forwarded-proto',
])

/** @param {string} value */
export function scrubString(value) {
  return value.replace(EMAIL, '[email]')
}

/** Replaces e-mail addresses in all strings of a value (objects/arrays, limited depth). */
export function scrubDeep(value, depth = 0) {
  if (typeof value === 'string') return scrubString(value)
  if (!value || typeof value !== 'object' || depth >= MAX_DEPTH) return value
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1))
  const out = {}
  for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v, depth + 1)
  return out
}

/** @param {string} url */
export function stripQuery(url) {
  if (typeof url !== 'string') return url
  const i = url.search(/[?#]/)
  return i === -1 ? url : url.slice(0, i)
}

function mergeContext(event, ctx) {
  if (!ctx || typeof ctx !== 'object') return
  if (ctx.user) event.user = { ...event.user, ...ctx.user }
  if (ctx.tags) event.tags = { ...event.tags, ...ctx.tags }
  if (ctx.extra) event.extra = { ...event.extra, ...ctx.extra }
  if (ctx.contexts) {
    event.contexts = { ...event.contexts }
    for (const [key, value] of Object.entries(ctx.contexts)) {
      event.contexts[key] = { ...event.contexts[key], ...value }
    }
  }
}

function scrubEvent(event) {
  if (event.message) {
    if (typeof event.message === 'string') event.message = scrubString(event.message)
    else if (typeof event.message === 'object') event.message = scrubDeep(event.message)
  }
  if (event.logentry) event.logentry = scrubDeep(event.logentry)

  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value === 'string') ex.value = scrubString(ex.value)
  }

  if (event.request) {
    const req = event.request
    if (typeof req.url === 'string') req.url = scrubString(req.url)
    if (typeof req.query_string === 'string') req.query_string = scrubString(req.query_string)
    else if (req.query_string) req.query_string = scrubDeep(req.query_string)
    if (req.data) req.data = scrubDeep(req.data)
    delete req.cookies
    delete req.env
    if (req.headers && typeof req.headers === 'object') {
      const headers = {}
      for (const [key, value] of Object.entries(req.headers)) {
        const name = key.toLowerCase()
        if (!ALLOWED_HEADERS.has(name)) continue
        headers[key] = name === 'referer' ? scrubString(stripQuery(String(value))) : scrubDeep(value)
      }
      req.headers = headers
    }
  }

  if (event.extra) event.extra = scrubDeep(event.extra)
  if (event.tags) event.tags = scrubDeep(event.tags)
  if (event.contexts) event.contexts = scrubDeep(event.contexts)

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b) => {
      const crumb = { ...b }
      if (typeof crumb.message === 'string') crumb.message = scrubString(crumb.message)
      if (crumb.data) {
        const data = { ...crumb.data }
        // fetch / xhr / navigation: no query strings (tokens, search terms, e-mail links)
        for (const key of ['url', 'from', 'to']) {
          if (typeof data[key] === 'string') data[key] = stripQuery(data[key])
        }
        crumb.data = scrubDeep(data)
      }
      return crumb
    })
  }

  if (event.user) {
    event.user = scrubDeep(event.user)
    delete event.user.ip_address
    delete event.user.email
    if (Object.keys(event.user).length === 0) delete event.user
  }
}

/**
 * @param {any} event Sentry event
 * @param {any} hint
 * @param {{ consent: boolean, contexts: Array<() => any>, filters: Array<(event: any, hint: any) => any>, breadcrumbs?: 'always' | 'consent' | 'never' }} options
 * @returns {any} event or null (drop)
 */
export function processEvent(event, hint, { consent, contexts, filters, breadcrumbs = 'always' }) {
  if (!event) return event

  if (consent) {
    for (const provider of contexts) {
      try {
        mergeContext(event, provider())
      } catch {
        // a broken provider must not block the report
      }
    }
  } else {
    // without consent no user data at all
    delete event.user
  }

  scrubEvent(event)

  if (breadcrumbs === 'never' || (breadcrumbs === 'consent' && !consent)) {
    delete event.breadcrumbs
  }

  let result = event
  for (const filter of filters) {
    try {
      result = filter(result, hint)
    } catch {
      // keep the event as it was before the broken filter
    }
    if (!result) return null
  }
  return result
}
