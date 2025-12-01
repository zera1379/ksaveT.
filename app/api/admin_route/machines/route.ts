import { NextResponse } from 'next/server'

export const runtime = 'edge'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    // simple validation
    const { name, ksave, location } = body || {}
    if (!name || !ksave) return NextResponse.json({ error: 'name and ksave are required' }, { status: 400 })

    const INFLUX_HOST = process.env.INFLUX_HOST || process.env.DOCKER_INFLUXDB_INIT_HOST || process.env.INFLUX_URL || 'http://127.0.0.1:8086'
    const INFLUX_ORG = process.env.INFLUX_ORG || process.env.DOCKER_INFLUXDB_INIT_ORG || 'K-Energy_Save'
    const INFLUX_BUCKET = process.env.INFLUX_BUCKET || process.env.DOCKER_INFLUXDB_INIT_BUCKET || 'k_db'
    const INFLUX_TOKEN = process.env.INFLUX_TOKEN || process.env.DOCKER_INFLUXDB_INIT_TOKEN || ''

    // helpers for line-protocol escaping (kept small/compatible with write route)
    const escTag = (s: any) => String(s).replace(/,/g, '\\,').replace(/ /g, '\\ ').replace(/=/g, '\\=')
    const escMeasurement = (s: any) => String(s).replace(/,/g, '\\,').replace(/ /g, '\\ ')
    const formatFieldValue = (v: any) => {
      // return a valid line-protocol field value. Never produce an empty token.
      if (v === null || v === undefined) return '""'
      if (typeof v === 'boolean') return v ? 'true' : 'false'
      if (typeof v === 'number') return Number.isInteger(v) ? `${v}i` : String(v)
      return `"${String(v).replace(/"/g, '\\"')}"`
    }

    // Build a single point for measurement `machines`
    const measurement = 'machines'
    const tags: any = { device: ksave }
    if (location) tags.site = location
    if (name) tags.name = name
    const fields: any = { registered: true, createdAt: new Date().toISOString() }

    const tagPart = Object.keys(tags).map((k) => `${escTag(k)}=${escTag(tags[k])}`).join(',')
    const fieldPart = Object.keys(fields).map((k) => `${k}=${formatFieldValue(fields[k])}`).join(',')
    const head = tagPart ? `${escMeasurement(measurement)},${tagPart}` : `${escMeasurement(measurement)}`
    const line = `${head} ${fieldPart}`

    // write to Influx
    const writeUrl = `${INFLUX_HOST.replace(/\/$/, '')}/api/v2/write?org=${encodeURIComponent(INFLUX_ORG)}&bucket=${encodeURIComponent(INFLUX_BUCKET)}&precision=s`
    const headers: any = { 'Content-Type': 'text/plain; charset=utf-8' }
    if (INFLUX_TOKEN) headers.Authorization = `Token ${INFLUX_TOKEN}`
    // Attempt to write to Influx and handle network errors clearly.
    let influxRes: Response
    let influxText = ''
    try {
      influxRes = await fetch(writeUrl, {
        method: 'POST',
        headers,
        body: line,
      })
    } catch (fetchErr: any) {
      console.error('Influx write fetch failed:', fetchErr)
      return NextResponse.json({ ok: false, error: `influx write fetch failed: ${String(fetchErr?.message || fetchErr)}` }, { status: 502 })
    }

    try {
      influxText = await influxRes.text()
    } catch (txtErr: any) {
      console.error('Failed reading Influx response text:', txtErr)
      influxText = String(txtErr?.message || txtErr)
    }

    if (!influxRes.ok) {
      console.error('Influx write returned non-ok:', influxRes.status, influxText)
      return NextResponse.json({ ok: false, status: influxRes.status, error: influxText }, { status: 502 })
    }

    // File backup removed for Edge Runtime compatibility
    const saved = { id: `m-${Date.now()}`, name, ksave, location: location || null, createdAt: new Date().toISOString() }
    return NextResponse.json({ 
      ok: true, 
      machine: saved, 
      written: 1,
      note: 'Edge Runtime: local file backup disabled'
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
