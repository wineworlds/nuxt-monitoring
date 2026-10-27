import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import client from 'prom-client'

/**
 * PM2 cluster mode: all workers share one port, so a scrape reaches a random worker.
 * Every worker writes a snapshot of its metrics to a shared temp dir; the worker that
 * answers the scrape aggregates all fresh snapshots (prom-client AggregatorRegistry).
 */
const SNAPSHOT_INTERVAL_MS = 10_000
// a snapshot older than this belongs to a worker that is gone
const SNAPSHOT_MAX_AGE_MS = 60_000

export function isClusterMode(setting) {
  if (setting === true || setting === false) return setting
  return process.env.exec_mode === 'cluster_mode' && Number(process.env.instances) !== 1
}

function snapshotDir(appName) {
  return join(tmpdir(), 'nuxt-monitoring', appName.replace(/[^\w.-]/g, '_'))
}

async function writeSnapshot(registry, dir) {
  const file = join(dir, `${process.pid}.json`)
  writeFileSync(`${file}.tmp`, JSON.stringify(await registry.getMetricsAsJSON()))
  renameSync(`${file}.tmp`, file)
}

export function startSnapshots(registry, appName) {
  const dir = snapshotDir(appName)
  mkdirSync(dir, { recursive: true })
  const write = () => writeSnapshot(registry, dir).catch((error) => {
    console.warn('[nuxt-monitoring] could not write metrics snapshot:', error)
  })
  write()
  setInterval(write, SNAPSHOT_INTERVAL_MS).unref()
}

export async function aggregatedMetrics(registry, appName) {
  const dir = snapshotDir(appName)
  await writeSnapshot(registry, dir)

  const snapshots = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const file = join(dir, name)
    try {
      if (Date.now() - statSync(file).mtimeMs > SNAPSHOT_MAX_AGE_MS) {
        unlinkSync(file)
        continue
      }
      snapshots.push(JSON.parse(readFileSync(file, 'utf-8')))
    } catch {
      // removed or rewritten by another worker meanwhile
    }
  }
  return client.AggregatorRegistry.aggregate(snapshots)
}
