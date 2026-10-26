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
    }
  }
}
