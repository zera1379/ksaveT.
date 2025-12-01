import { NextResponse } from 'next/server'

export const runtime = 'edge'

// Dev-safe endpoint to seed demo machines into an InfluxDB bucket
// POST only. In production, require INFLUX_SEED_TOKEN header to match env var.
export async function POST(req: Request) {
  try {
    const seedTokenHeader = req.headers.get('x-seed-token') || ''
    const INFLUX_HOST = process.env.INFLUX_HOST || 'http://localhost:8086'
    const INFLUX_ORG = process.env.INFLUX_ORG || ''
  const INFLUX_BUCKET = process.env.INFLUX_BUCKET || process.env.DOCKER_INFLUXDB_INIT_BUCKET || 'k_db'
    const INFLUX_TOKEN = process.env.INFLUX_TOKEN || ''

    if (!INFLUX_ORG) {
      return NextResponse.json({ ok: false, error: 'INFLUX_ORG not configured' }, { status: 400 })
    }
    if (!INFLUX_TOKEN) {
      return NextResponse.json({ ok: false, error: 'INFLUX_TOKEN not configured' }, { status: 400 })
    }

    // production safety: require a seed token header if INFLUX_SEED_TOKEN is set
    const requireSeedToken = Boolean(process.env.INFLUX_SEED_TOKEN)
    if (requireSeedToken && process.env.INFLUX_SEED_TOKEN !== seedTokenHeader) {
      return NextResponse.json({ ok: false, error: 'unauthorized (missing or bad x-seed-token)' }, { status: 401 })
    }

    // demo machines (mirror the page demo)
    const machines = [
      { id: 'Ksave01', name: 'KSave01', site: 'Site A', status: 'OK', power: 120 },
      { id: 'Ksave02', name: 'KSave02', site: 'Site B', status: 'OK', power: 118 },
      { id: 'Ksave03', name: 'KSave03', site: 'Site D', status: 'Warning', power: 130 },
      { id: 'Ksave04', name: 'KSave04', site: 'Site C', status: 'OK', power: 95 },
      { id: 'Ksave05', name: 'KSave05', site: 'Site E', status: 'OK', power: 150 },
    ]

    const ts = Math.floor(Date.now() / 1000)
    let payload = ''

    for (const m of machines) {
      // stable 10-digit numeric series number derived from id (simple hash for Edge Runtime)
      const encoder = new TextEncoder()
      const data = encoder.encode(m.id)
      let hash = 0
      for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash) + data[i]
        hash = hash & hash // Convert to 32-bit integer
      }
      const num = (Math.abs(hash) % 9000000000) + 1000000000
      const series_no = String(num)

      // basic machine_status (legacy)
      const statusLine = `machine_status,ksave=${m.id},id=${m.id},site=${m.site},status=${m.status} power=${m.power}.0,series_no="${series_no}" ${ts}`
      payload += statusLine + '\n'

      // additional measurement: machines (includes power_before and derived electrical fields)
      // compute some demo derived values
      const current = +(m.power / 1000).toFixed(3)
      const power_before = +(+m.power).toFixed(3)
      const power_metrics = +(m.power / 1000 / 100).toFixed(6) // arbitrary small metric
      const kWh = +((m.power / 1000) * 1).toFixed(3) // 1 hour equivalent for demo
      const P = +power_before
      const Q = +(P * 0.2).toFixed(3)
      const S = +Math.sqrt(P * P + Q * Q).toFixed(3)
      const PF = +(P / S).toFixed(3)
      const THD = +((Math.random() * 5) + 1).toFixed(2)
      const F = 50

      const machinesLine = `machines,site=${m.site},device=${m.id},user=operator,role=admin current=${current},power_before=${power_before},power_metrics=${power_metrics},kWh=${kWh},P=${P},Q=${Q},S=${S},PF=${PF},THD=${THD},F=${F} ${ts}`
      payload += machinesLine + '\n'

      // additional measurement: power_metrics (aggregate / summary)
      const avg_power = +(m.power * 0.102).toFixed(3) // demo value
      const max_power = +(m.power * 0.125).toFixed(3)
      const pmLine = `power_metrics,site=${m.site},device=${m.id} avg_power=${avg_power},max_power=${max_power},kWh=${kWh},P=${P},Q=${Q},S=${S},PF=${PF},THD=${THD},F=${F} ${ts}`
      payload += pmLine + '\n'
    }

    const url = `${INFLUX_HOST.replace(/\/$/, '')}/api/v2/write?org=${encodeURIComponent(INFLUX_ORG)}&bucket=${encodeURIComponent(INFLUX_BUCKET)}&precision=s`

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${INFLUX_TOKEN}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: payload,
    })

    const text = await r.text()
    if (!r.ok) {
      return NextResponse.json({ ok: false, status: r.status, body: text }, { status: 502 })
    }

    return NextResponse.json({ ok: true, written: machines.length, bucket: INFLUX_BUCKET })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
