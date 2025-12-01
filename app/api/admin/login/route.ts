import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    // Simple admin authentication - in production use proper hashing
    // Allow either the original admin credential or the requested ksave credential
    if ((username === 'admin' && password === '9999') || (username === 'ksave' && password === '0000')) {
      // Generate a simple token (in production use JWT or proper session)
      const token = btoa(`${username}:${Date.now()}`)
      
      return NextResponse.json({ 
        success: true,
        token,
        message: 'Login successful'
      })
    } else {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }
  } catch (error) {
    console.error('Admin login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}