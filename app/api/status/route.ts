import { NextResponse } from 'next/server'

export const runtime = 'edge'

async function httpCheck(url: string, timeout = 2000) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    const res = await fetch(url, { 
      method: 'GET', 
      signal: controller.signal,
      cache: 'no-store'
    })
    clearTimeout(timeoutId)
    return res.ok
  } catch (e) {
    return false
  }
}

export async function GET() {
  // Use environment variables to get service URLs (Cloudflare Workers can't access localhost)
  const influxHost = process.env.INFLUX_HOST || process.env.DOCKER_INFLUXDB_INIT_HOST || 'http://127.0.0.1:8086'
  const grafanaHost = process.env.GRAFANA_URL || 'http://127.0.0.1:3000'
  
  const results: any = {}

  // InfluxDB health
  try {
    const res = await fetch(`${influxHost}/health`, { method: 'GET', cache: 'no-store' })
    if (res.ok) {
      const body = await res.json().catch(() => ({}))
      results.influx = { ok: true, info: body }
    } else {
      results.influx = { ok: false, status: res.status }
    }
  } catch (e) {
    results.influx = { ok: false, error: String(e) }
  }

  // Grafana health
  try {
    const res = await fetch(`${grafanaHost}/api/health`, { method: 'GET', cache: 'no-store' })
    if (res.ok) {
      const body = await res.json().catch(() => ({}))
      results.grafana = { ok: true, info: body }
    } else {
      results.grafana = { ok: false, status: res.status }
    }
  } catch (e) {
    results.grafana = { ok: false, error: String(e) }
  }

  // MQTT and Telegraf status checks removed in Edge Runtime
  // These services would need separate monitoring endpoints
  results.mqtt = { ok: null, note: 'TCP checks not available in Edge Runtime' }
  results.telegraf = { ok: null, note: 'Docker checks not available in Edge Runtime' }

  return NextResponse.json({ services: results })
}
