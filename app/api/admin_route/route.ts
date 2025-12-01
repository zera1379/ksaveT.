import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, password } = body

    // Simple authentication - you should use proper auth in production
    if (username === 'admin' && password === '9999') {
      // Generate a simple token (in production, use proper JWT)
      const token = btoa(`${username}:${Date.now()}`)
      
      return NextResponse.json({ 
        success: true, 
        token,
        message: 'Login successful' 
      })
    } else {
      return NextResponse.json(
        { error: 'Invalid username or password' }, 
        { status: 401 }
      )
    }
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
}