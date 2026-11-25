import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { processEvent, stripQuery } from '../src/runtime/sentry/process-event.mjs'
import {
  _getRegistry,
  _setCaptureImpl,
  captureAppError,
  captureAppMessage,
  hasDiagnosticsConsent,
  registerDiagnosticsContext,
  registerEventFilter,
  setDiagnosticsConsent,
} from '../src/runtime/sentry/registry.mjs'

const STATE_KEY = Symbol.for('wineworlds.nuxt-monitoring.sentry')

function sampleEvent() {
  return {
    message: 'Mail an max.mustermann@example.de fehlgeschlagen',
    exception: { values: [{ type: 'Error', value: 'User kunde+1@shop.example.com exists' }] },
    request: {
      url: 'https://shop.example.de/?mail=a@b.de',
      query_string: 'mail=a@b.de',
      cookies: { s: 'x' },
      headers: { Host: 'shop.example.de', 'User-Agent': 'UA', 'x-forwarded-for': '203.0.113.7', 'X-Real-IP': '203.0.113.7', cookie: '[Filtered]', 'sw-context-token': 't', referer: 'https://shop.example.de/x?mail=a@b.de' },
    },
    user: { id: '42', email: 'a@b.de', ip_address: '1.2.3.4' },
    extra: { nested: { list: ['c@d.org'] } },
    breadcrumbs: [
      { category: 'fetch', data: { url: '/store-api/search?search=x@y.de&p=1', method: 'GET' } },
      { category: 'console', message: 'login for e@f.de' },
      { category: 'navigation', data: { from: '/a?x=1', to: '/b#frag' } },
    ],
  }
}

const opts = (o = {}) => ({ consent: false, contexts: [], filters: [], ...o })

beforeEach(() => {
  delete globalThis[STATE_KEY]
  globalThis.window = {} // registry behaves as in the browser
})

test('scrubs e-mail addresses everywhere', () => {
  const e = processEvent(sampleEvent(), {}, opts())
  const json = JSON.stringify(e)
  assert.doesNotMatch(json, /@(example|shop|b\.de|d\.org|y\.de|f\.de)/)
  assert.equal(e.message, 'Mail an [email] fehlgeschlagen')
  assert.equal(e.exception.values[0].value, 'User [email] exists')
  assert.equal(e.request.cookies, undefined)
})

test('request headers: allowlist only, no forwarded IPs, referer without query', () => {
  const e = processEvent(sampleEvent(), {}, opts())
  assert.deepEqual(e.request.headers, { Host: 'shop.example.de', 'User-Agent': 'UA', referer: 'https://shop.example.de/x' })
})

test('strips query strings from breadcrumb urls', () => {
  const e = processEvent(sampleEvent(), {}, opts())
  assert.equal(e.breadcrumbs[0].data.url, '/store-api/search')
  assert.equal(e.breadcrumbs[2].data.from, '/a')
  assert.equal(e.breadcrumbs[2].data.to, '/b')
  assert.equal(stripQuery('/x'), '/x')
})

test('without consent: no user, no context', () => {
  let called = false
  const e = processEvent(sampleEvent(), {}, opts({ contexts: [() => { called = true; return { user: { id: 'K1' } } }] }))
  assert.equal(e.user, undefined)
  assert.equal(called, false)
})

test('with consent: context merged, ip and email removed, scrubbed', () => {
  const e = processEvent(sampleEvent(), {}, opts({
    consent: true,
    contexts: [
      () => ({ user: { id: 'K-1001', email: 'x@y.de' }, tags: { customerGroup: 'b2c' }, contexts: { cart: { total: 12.5, note: 'mail z@z.de' } }, extra: { items: 2 } }),
      () => { throw new Error('broken provider') },
    ],
  }))
  assert.deepEqual(e.user, { id: 'K-1001' })
  assert.equal(e.tags.customerGroup, 'b2c')
  assert.equal(e.contexts.cart.total, 12.5)
  assert.equal(e.contexts.cart.note, 'mail [email]')
  assert.equal(e.extra.items, 2)
})

test('breadcrumb modes', () => {
  assert.ok(processEvent(sampleEvent(), {}, opts({ breadcrumbs: 'always' })).breadcrumbs)
  assert.equal(processEvent(sampleEvent(), {}, opts({ breadcrumbs: 'consent' })).breadcrumbs, undefined)
  assert.ok(processEvent(sampleEvent(), {}, opts({ breadcrumbs: 'consent', consent: true })).breadcrumbs)
  assert.equal(processEvent(sampleEvent(), {}, opts({ breadcrumbs: 'never', consent: true })).breadcrumbs, undefined)
})

test('filters run in order, can modify and drop, broken filter is skipped', () => {
  const e = processEvent(sampleEvent(), {}, opts({
    filters: [
      (ev) => ({ ...ev, tags: { f1: '1' } }),
      () => { throw new Error('broken') },
      (ev) => ({ ...ev, tags: { ...ev.tags, f3: '1' } }),
    ],
  }))
  assert.deepEqual(e.tags, { f1: '1', f3: '1' })
  assert.equal(processEvent(sampleEvent(), {}, opts({ filters: [() => null] })), null)
})

test('registry: consent, register/unregister, server no-ops', () => {
  assert.equal(hasDiagnosticsConsent(), false)
  setDiagnosticsConsent(true)
  assert.equal(hasDiagnosticsConsent(), true)
  const p = () => ({})
  const un = registerDiagnosticsContext('cart', p)
  const unF = registerEventFilter('f', (e) => e)
  assert.equal(_getRegistry().contexts.length, 1)
  assert.equal(_getRegistry().filters.length, 1)
  // re-registering a name replaces; the stale unregister must not remove the new one
  const p2 = () => ({})
  registerDiagnosticsContext('cart', p2)
  un()
  assert.deepEqual(_getRegistry().contexts, [p2])
  unF()
  assert.equal(_getRegistry().filters.length, 0)

  delete globalThis.window
  assert.equal(hasDiagnosticsConsent(), false)
  setDiagnosticsConsent(true)
  registerDiagnosticsContext('srv', () => ({}))
  assert.equal(_getRegistry().contexts.length, 1) // only p2 from the browser part
  assert.equal(_getRegistry().consent, false)
})

test('captureAppError / captureAppMessage: no-op without init, forward, never throw', () => {
  captureAppError(new Error('x')) // no impl → no throw
  captureAppMessage('x')
  const calls = []
  _setCaptureImpl((kind, value, o) => calls.push([kind, value instanceof Error ? value.message : value, o]))
  captureAppError(new Error('boom'), { area: 'checkout', step: 'place-order' })
  captureAppMessage('Cart-Fehler', { area: 'cart', fingerprint: ['cart-error', 'x'] })
  captureAppMessage('err', { level: 'error' })
  assert.deepEqual(calls, [
    ['exception', 'boom', { area: 'checkout', step: 'place-order' }],
    ['message', 'Cart-Fehler', { level: 'warning', area: 'cart', fingerprint: ['cart-error', 'x'] }],
    ['message', 'err', { level: 'error' }],
  ])
  _setCaptureImpl(() => { throw new Error('impl broken') })
  captureAppError(new Error('y'))
})
