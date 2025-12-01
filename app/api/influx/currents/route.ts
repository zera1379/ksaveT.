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

function parseCsvRows(csv: string) {
  const lines = csv.split(/\r?\n/)
  const cols: string[] = []
  const rows: any[] = []
  for (const line of lines) {
    if (!line) continue
    if (line.startsWith('#')) continue
    if (cols.length === 0) {
      // header line
      const header = line.split(',').map((s) => s.trim())
      cols.push(...header)
      continue
    }
    const parts = line.split(',')
    if (parts.length < cols.length) continue
    const obj: any = {}
    for (let i = 0; i < cols.length; i++) {
      obj[cols[i]] = parts[i]?.trim()
    }
    rows.push(obj)
  }
  return rows
}

export async function GET(req: Request) {
  try {
    const INFLUX_HOST = process.env.INFLUX_HOST || process.env.DOCKER_INFLUXDB_INIT_HOST || 'http://127.0.0.1:8086'
    const INFLUX_BUCKET = process.env.INFLUX_BUCKET || process.env.DOCKER_INFLUXDB_INIT_BUCKET || 'k_db'
    const INFLUX_ORG = process.env.INFLUX_ORG || process.env.DOCKER_INFLUXDB_INIT_ORG || 'K-Energy_Save'
    const INFLUX_TOKEN = process.env.INFLUX_TOKEN || process.env.DOCKER_INFLUXDB_INIT_TOKEN || ''

    // allow client to request a time range like -15m, -1h, -24h, -7d
    const url = new URL(req.url)
    const rawRange = url.searchParams.get('range') || ''
    const rawAt = url.searchParams.get('at') || ''

    // If `at` is provided (ISO timestamp), return points around that moment (±1min)
    let flux: string
    if (rawAt) {
      const atTime = Date.parse(rawAt)
      if (isNaN(atTime)) throw new Error('invalid at parameter')
      const start = new Date(atTime - 60 * 1000).toISOString()
      const stop = new Date(atTime + 60 * 1000).toISOString()
      flux = `from(bucket: "${INFLUX_BUCKET}")\n  |> range(start: ${start}, stop: ${stop})\n  |> filter(fn: (r) => r._field =~ /(?i)current|amp|i|ia|ib|ic/)\n  |> last()\n  |> keep(columns: ["_time","_measurement","_field","_value","ksave","device","location"])`
    } else {
      // basic validation: only allow formats like -15m, -1h, -24h, -7d
      const allowed = /^-\d+(m|h|d)$/
      const range = allowed.test(rawRange) ? rawRange : '-1h'
      flux = `from(bucket: "${INFLUX_BUCKET}")\n  |> range(start: ${range})\n  |> filter(fn: (r) => r._field =~ /(?i)current|amp|i|ia|ib|ic/)\n  |> last()\n  |> keep(columns: ["_time","_measurement","_field","_value","ksave","device","location"])`
    }

    const csv = await runFluxQuery(INFLUX_HOST, INFLUX_ORG, INFLUX_TOKEN, flux)
    const rows = parseCsvRows(csv)

    const out = rows.map((r) => ({
      time: r._time,
      measurement: r._measurement,
      field: r._field,
      value: Number(r._value),
      ksave: r.ksave || null,
      device: r.device || null,
      location: r.location || null,
    }))
    return NextResponse.json({ ok: true, rows: out })
  } catch (err: any) {
    // If Influx is not reachable, provide a small development fallback so the UI can render during local dev.
    if (process.env.NODE_ENV !== 'production') {
      const sample = [
        { time: new Date().toISOString(), measurement: 'sample', field: 'ia', value: 1.23, ksave: 'KS-001', device: 'DEV-1', location: 'Site A' },
        { time: new Date(Date.now() - 60000).toISOString(), measurement: 'sample', field: 'ib', value: 0.98, ksave: 'KS-002', device: 'DEV-2', location: 'Site B' }
      ]
      return NextResponse.json({ ok: true, rows: sample, note: 'fallback-sample' })
    }

    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
