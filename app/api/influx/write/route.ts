import { NextResponse } from 'next/server'

export const runtime = 'edge'

// Server route to write points to InfluxDB (file backup removed for Edge Runtime)
export async function POST(req: Request) {
  try {
    const INFLUX_HOST = process.env.INFLUX_HOST || 'http://127.0.0.1:8086'
    const INFLUX_ORG = process.env.INFLUX_ORG || ''
    const INFLUX_BUCKET = process.env.INFLUX_BUCKET || ''
    const INFLUX_TOKEN = process.env.INFLUX_TOKEN || ''
    const WRITE_TOKEN = process.env.INFLUX_WRITE_TOKEN || '' // optional extra auth for this route

    if (!INFLUX_ORG || !INFLUX_BUCKET || !INFLUX_TOKEN) {
      return NextResponse.json({ ok: false, error: 'INFLUX_HOST/ORG/BUCKET/TOKEN not configured' }, { status: 400 })
    }

    // optional header-based guard
    const hdr = req.headers.get('x-write-token') || ''
    if (WRITE_TOKEN && WRITE_TOKEN !== hdr) {
      return NextResponse.json({ ok: false, error: 'unauthorized (missing or bad x-write-token)' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ ok: false, error: 'missing request body' }, { status: 400 })

    // Accept either an array of points or a single point
    const points = Array.isArray(body) ? body : (Array.isArray(body.points) ? body.points : [body])

    // helpers for line-protocol
    const escTag = (s: any) => String(s).replace(/,/g, '\\,').replace(/ /g, '\\ ').replace(/=/g, '\\=')
    const escMeasurement = (s: any) => String(s).replace(/,/g, '\\,').replace(/ /g, '\\ ')
    const formatFieldValue = (v: any) => {
      if (v === null || v === undefined) return null
      if (typeof v === 'boolean') return v ? 'true' : 'false'
      if (typeof v === 'number') {
        // Always send numbers as floats (no trailing 'i') to avoid Influx field type conflicts
        return String(v)
      }
      // string (including objects will be stringified)
      return `"${String(v).replace(/"/g, '\\"')}"`
    }

    // Device alias map - in Edge Runtime, load from environment variable or hardcode
    const aliases: Record<string, string> = {}
    try {
      const aliasJson = process.env.DEVICE_ALIASES
      if (aliasJson) {
        Object.assign(aliases, JSON.parse(aliasJson))
      }
    } catch (e) {
      // ignore parsing errors
    }

    const lines = points.map((p: any) => {
      // expected shapes: { measurement, tags, fields, ts }
      const measurement = p.measurement || p.m || 'measurement'
      const tags = p.tags || p.t || {}
      const fields = p.fields || p.f || (() => {
        // if points were sent as flat object, strip known keys
        const copy: any = { ...p }
        delete copy.measurement; delete copy.m; delete copy.tags; delete copy.t; delete copy.ts; delete copy.time; delete copy.timestamp
        return copy
      })()
      const ts = p.ts || p.time || p.timestamp || undefined
      // normalize timestamp to seconds (number). Accept numeric seconds, numeric ms, or ISO string.
      let tsSeconds: number | undefined = undefined
      if (ts !== undefined && ts !== null) {
        if (typeof ts === 'number') {
          tsSeconds = Math.floor(ts)
        } else {
          const asNum = Number(ts)
          if (!Number.isNaN(asNum) && String(ts).trim() !== '') {
            // numeric string — assume seconds if reasonably small, otherwise accept as-is
            tsSeconds = Math.floor(asNum)
          } else {
            const parsed = Date.parse(String(ts))
            if (!Number.isNaN(parsed)) tsSeconds = Math.floor(parsed / 1000)
          }
        }
      }

      // Determine input device will be done after fields are flattened below
      // Filter out undefined/null field values so we don't emit invalid tokens like `k=`.
      // Flatten one-level nested objects so payloads like { power_before: { kWh: 1.2, P: 100 } }
      // become fields 'power_before_kWh=1.2' and 'power_before_P=100'.
      const fieldMap: Record<string, any> = {}
      Object.keys(fields).forEach((k) => {
        const v = fields[k]
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          // flatten inner keys
          Object.keys(v).forEach((sub) => {
            fieldMap[`${k}_${sub}`] = v[sub]
          })
        } else {
          fieldMap[k] = v
        }
      })

        // Determine input device from several possible places (top-level, tags, or flattened fields)
        const inputDevice = (p.device || p.ksave || tags.device || fieldMap.device || fieldMap.ksave) as any
        // remove any device fields from field map to keep device as a tag
        if (fieldMap.device) delete fieldMap.device
        if (fieldMap.ksave) delete fieldMap.ksave

        let mappedDevice: any = inputDevice
        if (mappedDevice && typeof mappedDevice === 'string') {
          if (aliases[mappedDevice]) mappedDevice = aliases[mappedDevice]
          else {
            const m = mappedDevice.match(/^DEV-(\d+)$/i)
            if (m) {
              const n = Number(m[1])
              mappedDevice = `Ksave${String(n).padStart(2, '0')}`
            }
          }
        }

        // Ensure tags.device contains the mapped value (or existing tag) and keep original as device_input
        if (mappedDevice) tags.device = mappedDevice
        if (inputDevice) tags.device_input = inputDevice

        const tagPart = Object.keys(tags).map((k) => `${escTag(k)}=${escTag(tags[k])}`).join(',')

      const fieldEntries = Object.keys(fieldMap)
        .map((k) => [k, fieldMap[k]] as [string, any])
        .filter(([, v]) => v !== undefined && v !== null)
      const fieldPart = fieldEntries.map(([k, v]) => `${k}=${formatFieldValue(v)}`).join(',')

      const head = tagPart ? `${escMeasurement(measurement)},${tagPart}` : `${escMeasurement(measurement)}`
      return tsSeconds !== undefined ? `${head} ${fieldPart} ${tsSeconds}` : `${head} ${fieldPart}`
    }).filter(Boolean)

    if (lines.length === 0) return NextResponse.json({ ok: false, error: 'no valid points to write' }, { status: 400 })

    // write to Influx (network errors are handled and returned as 502)
    const writeUrl = `${INFLUX_HOST.replace(/\/$/, '')}/api/v2/write?org=${encodeURIComponent(INFLUX_ORG)}&bucket=${encodeURIComponent(INFLUX_BUCKET)}&precision=s`
    let influxRes: Response
    try {
      influxRes = await fetch(writeUrl, {
        method: 'POST',
        headers: {
          Authorization: `Token ${INFLUX_TOKEN}`,
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: lines.join('\n'),
      })
    } catch (fetchErr: any) {
      // Network / DNS / connection errors
      return NextResponse.json({ ok: false, error: `failed to connect to Influx host: ${String(fetchErr?.message || fetchErr)}` }, { status: 502 })
    }

    let influxText = ''
    try {
      influxText = await influxRes.text()
    } catch (readErr: any) {
      influxText = String(readErr?.message || readErr)
    }
    if (!influxRes.ok) {
      return NextResponse.json({ ok: false, status: influxRes.status, error: influxText }, { status: 502 })
    }

    // File backup removed for Edge Runtime compatibility
    // Consider using Cloudflare KV, R2, or external storage for backups
    return NextResponse.json({ 
      ok: true, 
      written: points.length, 
      bucket: INFLUX_BUCKET,
      note: 'Edge Runtime: local file backup disabled'
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 })
  }
}
