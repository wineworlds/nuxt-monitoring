export type DiagnosticsLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug'

export interface DiagnosticsContext {
  /** e.g. `{ id: customerNumber }`; `email` and `ip_address` are always removed */
  user?: Record<string, unknown>
  tags?: Record<string, string>
  contexts?: Record<string, Record<string, unknown>>
  extra?: Record<string, unknown>
}

export interface CaptureAppErrorOptions {
  /** tag `area`, e.g. `checkout` */
  area?: string
  /** tag `step`, e.g. `place-order` */
  step?: string
  /** @default 'error' (captureAppMessage: 'warning') */
  level?: DiagnosticsLevel
  tags?: Record<string, string>
  extra?: Record<string, unknown>
  /** custom grouping, e.g. `['cart-error', step, messageKey]` */
  fingerprint?: string[]
}

/** Consent of the visitor to extended diagnostics. Browser only, no-op on the server. */
export declare function setDiagnosticsConsent(value: boolean): void
export declare function hasDiagnosticsConsent(): boolean
/** Provider runs per event, only with consent. Browser only. Returns unregister. */
export declare function registerDiagnosticsContext(
  name: string,
  provider: () => DiagnosticsContext | null | undefined,
): () => void
/** Runs on every event before sending (after built-in scrubbing). Return null to drop. Returns unregister. */
export declare function registerEventFilter(
  name: string,
  fn: (event: any, hint: any) => any,
): () => void
/** Reports a caught error. No-op without DSN. */
export declare function captureAppError(error: unknown, options?: CaptureAppErrorOptions): void
/** Reports a message without exception (default level `warning`). No-op without DSN. */
export declare function captureAppMessage(message: string, options?: CaptureAppErrorOptions): void
