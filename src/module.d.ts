import type { NuxtModule } from '@nuxt/schema'

export interface ModuleOptions {
  /** @default true */
  enabled: boolean
  /** Path of the metrics endpoint. @default '/_metrics' */
  path: string
  /** Value of the `app` label. Defaults to the app's package.json name. Runtime: NUXT_MONITORING_APP_NAME */
  appName: string
  /**
   * Additional request groups (label `group`) by path prefix, merged over the defaults
   * `api`, `ipx`, `assets`, `internal`. Everything else is `ssr`.
   */
  requestGroups: Record<string, string[]>
  /**
   * Aggregate the metrics of all workers. `auto` = when running in PM2 cluster mode with
   * more than one instance. Runtime: NUXT_MONITORING_CLUSTER
   * @default 'auto'
   */
  cluster: 'auto' | boolean
  /**
   * Error tracking via GlitchTip (Sentry-compatible, @sentry/nuxt). Active only when a DSN
   * is set at build time (`NUXT_PUBLIC_SENTRY_DSN` or `dsn`); otherwise no Sentry code is bundled.
   */
  sentry: Partial<SentryOptions>
}

export interface SentryOptions {
  /** DSN of the GlitchTip project. Build env NUXT_PUBLIC_SENTRY_DSN takes precedence. */
  dsn: string
  /** Build env NUXT_PUBLIC_SENTRY_ENVIRONMENT takes precedence. @default 'production' */
  environment: string
}

declare const module: NuxtModule<ModuleOptions>
export default module

declare module '@nuxt/schema' {
  interface NuxtConfig {
    monitoring?: Partial<ModuleOptions>
  }
  interface RuntimeConfig {
    monitoring: {
      /** Bearer token for the metrics endpoint. Runtime: NUXT_MONITORING_TOKEN */
      token: string
      appName: string
      appVersion: string
      path: string
      requestGroups: Record<string, string[]>
      cluster: 'auto' | boolean
    }
  }
  interface PublicRuntimeConfig {
    /** Only present when the module was built with a DSN. Runtime: NUXT_PUBLIC_SENTRY_* */
    sentry?: {
      dsn: string
      environment: string
      /** `<appName>@<version>` from the app's package.json */
      release: string
    }
  }
}
