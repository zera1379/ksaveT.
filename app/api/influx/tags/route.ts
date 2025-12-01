import { NextResponse } from 'next/server'

export const runtime = 'edge'

async function runFluxQuery(INFLUX_HOST: string, INFLUX_ORG: string, INFLUX_TOKEN: string, flux: string) {
  const queryUrl = `${INFLUX_HOST.replace(/\/$/, '')}/api/v2/query?org=${encodeURIComponent(INFLUX_ORG)}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/vnd.flux',
    Accept: 'application/csv',
  }
  if (INFLUX_TOKEN) headers['Authorization'] = `Token ${INFLUX_TOKEN}`
  const res = await fetch(queryUrl, { method: 'POST', headers, body: flux })
  const text = await res.text()
  if (!res.ok) throw new Error(`Influx query failed: ${res.status} ${text}`)
  return String(text || '')
}

function parseCsvValues(csv: string) {
  const out = new Set<string>()
  const lines = csv.split(/\r?\n/)
  for (const line of lines) {
    if (!line) continue
    if (line.startsWith('#')) continue
    const parts = line.split(',')
    // usually the value is the last column
    const v = parts[parts.length - 1]?.trim()
    if (v && v !== 'value') out.add(v)
  }
  return Array.from(out)
}

export async function GET() {
  try {
    const INFLUX_HOST = process.env.INFLUX_HOST || process.env.DOCKER_INFLUXDB_INIT_HOST || 'http://127.0.0.1:8086'
    const INFLUX_BUCKET = process.env.INFLUX_BUCKET || process.env.DOCKER_INFLUXDB_INIT_BUCKET || 'k_db'
    const INFLUX_ORG = process.env.INFLUX_ORG || process.env.DOCKER_INFLUXDB_INIT_ORG || 'K-Energy_Save'
    const INFLUX_TOKEN = process.env.INFLUX_TOKEN || process.env.DOCKER_INFLUXDB_INIT_TOKEN || ''

    // Query for recent tag values (last 30 days) for common tag keys
    const fluxLocation = `import "influxdata/influxdb/schema"
schema.tagValues(bucket: "${INFLUX_BUCKET}", tag: "location", start: -30d)
|> sort()`

    const fluxKsave = `import "influxdata/influxdb/schema"
schema.tagValues(bucket: "${INFLUX_BUCKET}", tag: "ksave", start: -30d)
|> sort()`

    const fluxDevice = `import "influxdata/influxdb/schema"
schema.tagValues(bucket: "${INFLUX_BUCKET}", tag: "device", start: -30d)
|> sort()`

    // Run the queries in parallel
    const [locCsv, ksaveCsv, deviceCsv] = await Promise.allSettled([
      runFluxQuery(INFLUX_HOST, INFLUX_ORG, INFLUX_TOKEN, fluxLocation),
      runFluxQuery(INFLUX_HOST, INFLUX_ORG, INFLUX_TOKEN, fluxKsave),
      runFluxQuery(INFLUX_HOST, INFLUX_ORG, INFLUX_TOKEN, fluxDevice),
    ])

    const locations = locCsv.status === 'fulfilled' ? parseCsvValues(locCsv.value) : []
    const ksaveIds = ksaveCsv.status === 'fulfilled' ? parseCsvValues(ksaveCsv.value) : []
    const deviceIds = deviceCsv.status === 'fulfilled' ? parseCsvValues(deviceCsv.value) : []

    // merge id sources
    const ids = Array.from(new Set([...ksaveIds, ...deviceIds])).filter(Boolean)

    return NextResponse.json({ ok: true, locations, ids })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
