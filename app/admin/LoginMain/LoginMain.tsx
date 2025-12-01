"use client"

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginMain() {
	const router = useRouter()
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [pressed, setPressed] = useState(false)

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		setError(null)
		setLoading(true)
		try {
			const res = await fetch('/api/admin/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username, password })
			})

			if (!res.ok) {
				const text = await res.text()
				throw new Error(text || res.statusText)
			}

			const data = await res.json()
			if (data && data.token) {
				try {
					localStorage.setItem('k_system_admin_token', data.token)
				} catch (err) {
					console.error('failed to save token', err)
				}
				router.replace('/admin/main')
				return
			}

			throw new Error('Invalid response from server')
		} catch (err: any) {
			setError(err?.message || 'Login failed')
		} finally {
			setLoading(false)
		}
	}

	return (
		<div style={styles.page}>
			<div style={styles.overlay} />
			<main style={styles.card}>
				<div style={styles.brand}>
					<h1 style={{ margin: 0, fontSize: 28 }}>K Energy Save</h1>
					
				</div>

				<form onSubmit={handleSubmit} style={styles.form}>
					<label style={styles.label}>
						Username
						<input
							required
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							style={styles.input}
							type="text"
							autoComplete="username"
						/>
					</label>

					<label style={styles.label}>
						Password
						<input
							required
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							style={styles.input}
							type="password"
							autoComplete="current-password"
						/>
					</label>

					{error && <div style={styles.error}>{error}</div>}

					<button
						type="submit"
						style={{
							...styles.button,
							transform: pressed ? 'translateY(1px) scale(.997)' : 'translateY(0)',
							boxShadow:
								pressed
									? '0 4px 12px rgba(2,6,23,0.6), inset 0 -2px 0 rgba(0,0,0,0.18)'
									: '0 10px 28px rgba(2,6,23,0.7), 0 2px 6px rgba(124,58,237,0.12), inset 0 -2px 0 rgba(255,255,255,0.03)'
						}}
						disabled={loading}
						onPointerDown={() => setPressed(true)}
						onPointerUp={() => setPressed(false)}
						onPointerLeave={() => setPressed(false)}
					>
						{loading ? 'Signing in…' : 'Sign in'}
					</button>
				</form>

				<footer style={styles.footer}>
					<small style={{ color: '#9ca3af' }}>K Energy Save co., Ltd • {new Date().getFullYear()}</small>
				</footer>
			</main>
		</div>
	)
}

const styles: { [k: string]: React.CSSProperties } = {
	page: {
		minHeight: '100vh',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		position: 'relative',
		backgroundImage: 'linear-gradient(135deg, #0f172a 0%, #0b1220 100%)',
		backgroundSize: 'cover',
		padding: 32,
		boxSizing: 'border-box'
	},
	overlay: {
		position: 'absolute',
		inset: 0,
		background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.03), rgba(0,0,0,0.5))',
		pointerEvents: 'none'
	},
	card: {
		width: '100%',
		maxWidth: 520,
		background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012))',
		border: '1px solid rgba(255, 254, 255, 0.4)',
		borderRadius: 14,
		padding: 32,
		position: 'relative',
		boxShadow: '0 12px 30px rgba(2,6,23,0.72), 0 2px 8px rgba(124,58,237,0.08), inset 0 1px 0 rgba(255,255,255,0.02)',
		color: '#e6eefb',
		transform: 'translateY(-2px)'
	},
	brand: {
		textAlign: 'center',
		marginBottom: 18
	},
	form: {
		display: 'grid',
		gap: 12
	},
	label: {
		display: 'block',
		fontSize: 14,
		color: '#cbd5e1'
	},
	input: {
		width: '100%',
		marginTop: 8,
		padding: '12px 14px',
		borderRadius: 10,
		border: '1px solid rgba(250, 248, 253, 0.48)',
		background: 'linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.02))',
		color: '#fff',
		fontSize: 15,
		boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.45)'
	},
	button: {
		marginTop: 10,
		padding: '12px 16px',
		borderRadius: 10,
		border: 'none',
		background: 'linear-gradient(90deg,#1e40af 0%, #7c3aed 100%)',
		color: '#fff',
		fontWeight: 700,
		cursor: 'pointer',
		letterSpacing: '0.2px',
		boxShadow: '0 10px 28px rgba(2,6,23,0.7), 0 2px 6px rgba(124,58,237,0.12), inset 0 -2px 0 rgba(255,255,255,0.03)',
		transition: 'transform .12s ease, box-shadow .12s ease'
	},
	error: {
		color: '#fecaca',
		background: 'rgba(254, 226, 226, 0.04)',
		padding: '8px 10px',
		borderRadius: 8,
		fontSize: 13
	},
	footer: {
		marginTop: 18,
		textAlign: 'center'
	}
}

