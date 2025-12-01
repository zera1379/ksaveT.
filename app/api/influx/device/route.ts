import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'missing id query param' }, { status: 400 })

    const INFLUX_HOST = process.env.INFLUX_HOST || process.env.DOCKER_INFLUXDB_INIT_HOST || 'http://127.0.0.1:8086'
    const INFLUX_BUCKET = process.env.INFLUX_BUCKET || process.env.DOCKER_INFLUXDB_INIT_BUCKET || 'k_db'
    const INFLUX_ORG = process.env.INFLUX_ORG || process.env.DOCKER_INFLUXDB_INIT_ORG || 'K-Energy_Save'
    const INFLUX_TOKEN = process.env.INFLUX_TOKEN || process.env.DOCKER_INFLUXDB_INIT_TOKEN || ''

    // Flexible Flux query: try to find recent points that have a tag equal to the device id
    const flux = `from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement != "" and (
      (exists r.ksave and r.ksave == "${id}") or
      (exists r.device and r.device == "${id}") or
      (exists r.host and r.host == "${id}") or
      (exists r.machine and r.machine == "${id}")
    ))
  |> last()`

    const queryUrl = `${INFLUX_HOST.replace(/\/$/, '')}/api/v2/query?org=${encodeURIComponent(INFLUX_ORG)}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/vnd.flux',
      Accept: 'application/json',
    }
    if (INFLUX_TOKEN) headers['Authorization'] = `Token ${INFLUX_TOKEN}`

    const res = await fetch(queryUrl, { method: 'POST', headers, body: flux })

    const text = await res.text()
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, error: text }, { status: 502 })
    }

    // Best-effort parsing: extract a human-friendly series name and a series number
    const raw = String(text || '')
  const parsed: { seriesName?: string; seriesNo?: string; location?: string; lastTime?: string; secondsAgo?: number; ok?: boolean
    current?: number; power_before?: number; power_metrics?: number; kWh?: number; P?: number; Q?: number; S?: number; PF?: number; THD?: number; F?: number
  } = {}

    // common keys: _measurement, ksave, series, series_name, name
    const mMatch = raw.match(/"_measurement"\s*:\s*"([^"]+)"/i)
    const kMatch = raw.match(/"ksave"\s*:\s*"([^"]+)"/i)
    const sMatch = raw.match(/"series(?:_name)?"\s*:\s*"([^"]+)"/i)
    const nameMatch = raw.match(/"name"\s*:\s*"([^"]+)"/i)

    parsed.seriesName = (kMatch && kMatch[1]) || (sMatch && sMatch[1]) || (mMatch && mMatch[1]) || (nameMatch && nameMatch[1])

  // series number heuristics: look for series_no, no, id, device numeric value, or a numeric _value
    const snMatch = raw.match(/"series_no"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/i)
    const idMatch = raw.match(/"(?:device|host|machine|id)"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/i)
    const valueMatch = raw.match(/"_value"\s*:\s*([0-9.+\-eE]+)/i)
    parsed.seriesNo = (snMatch && snMatch[1]) || (idMatch && idMatch[1]) || (valueMatch && valueMatch[1]) || undefined

  // try to find a location/site tag
  const locMatch = raw.match(/"location"\s*:\s*"([^"]+)"/i)
  const siteMatch = raw.match(/"site(?:_name)?"\s*:\s*"([^"]+)"/i)
  const locTagMatch = raw.match(/"loc"\s*:\s*"([^"]+)"/i)
  parsed.location = (locMatch && locMatch[1]) || (siteMatch && siteMatch[1]) || (locTagMatch && locTagMatch[1]) || undefined

    // Try to extract a timestamp from the raw result to determine recency
    const timeMatch = raw.match(/"_time"\s*:\s*"([^"]+)"/i) || raw.match(/"time"\s*:\s*"([^"]+)"/i)
    if (timeMatch && timeMatch[1]) {
      try {
        const t = new Date(timeMatch[1])
        if (!Number.isNaN(t.getTime())) {
          parsed.lastTime = t.toISOString()
          const secondsAgo = Math.floor((Date.now() - t.getTime()) / 1000)
          parsed.secondsAgo = secondsAgo
          // consider device OK if last point within 5 minutes
          parsed.ok = secondsAgo <= 300
        }
      } catch (e) {
        // ignore
      }
    }

    // Return raw query result plus parsed fields for client convenience
    // Try to extract common electrical fields from the raw JSON/text if present
    try {
      const fieldNames = ['current','power_before','power_metrics','kWh','P','Q','S','PF','THD','F','power']
      for (const k of fieldNames) {
        // match patterns like "kWh":123.45  or kWh=123 or "kWh" : "123"
        const re = new RegExp(`"?${k}"?\s*[:=]\s*\"?([0-9.+\-eE]+)\"?`, 'i')
        const m = raw.match(re)
        if (m && m[1]) {
          const v = Number(m[1])
          if (!Number.isNaN(v)) {
            // map 'power' to power_before if power_before not present
            if (k === 'power' && parsed.power_before == null) parsed.power_before = v
            else (parsed as any)[k] = v
          }
        }
      }
    } catch (e) {
      // ignore parsing errors
    }
  return NextResponse.json({ ok: true, id, raw, parsed })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
