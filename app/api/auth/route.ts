import { NextResponse } from 'next/server'

export const runtime = 'edge'

const INFLUX_BASE = process.env.INFLUX_URL || process.env.INFLUX_HOST || 'http://localhost:8086'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { username, password } = body || {}
    if (!username || !password) {
      return NextResponse.json({ error: 'Missing username or password' }, { status: 400 })
    }

    // For this demo we accept the specific Influx-backed test credential
    // username: user  password: 4444
    if (username !== 'user' || password !== '4444') {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
    }

    // Verify InfluxDB is reachable (health endpoint)
    try {
      const healthRes = await fetch(`${INFLUX_BASE}/health`)
      if (!healthRes.ok) {
        return NextResponse.json({ error: 'InfluxDB is not healthy or unreachable' }, { status: 502 })
      }
      const health = await healthRes.json().catch(() => ({}))
      // health.status is usually "pass" when healthy
      if (health && health.status && health.status !== 'pass') {
        return NextResponse.json({ error: 'InfluxDB reports unhealthy' }, { status: 502 })
      }
    } catch (e) {
      return NextResponse.json({ error: 'Failed to reach InfluxDB' }, { status: 502 })
    }

    // Issue a demo token (in a real app, mint a JWT or use Influx token)
    const token = `influx-dev-token-${Date.now()}`
    return NextResponse.json({ token, username })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
