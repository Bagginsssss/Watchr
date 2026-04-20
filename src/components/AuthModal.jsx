import { useState } from 'react'
import { supabase, supabaseReady } from '../lib/supabase.js'

export default function AuthModal({ onClose }) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (!supabaseReady || !supabase) throw new Error('Supabase not configured. Add .env credentials.')

      if (mode === 'signup') {
        const trimmed = username.trim().toLowerCase()
        if (!trimmed) throw new Error('Please choose a username.')
        if (trimmed.length < 3) throw new Error('Username must be at least 3 characters.')
        if (!/^[a-z0-9_]+$/.test(trimmed)) throw new Error('Username can only contain letters, numbers, and underscores.')

        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', trimmed)
          .maybeSingle()
        if (existing) throw new Error('That username is already taken.')

        const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) throw signUpError

        if (data?.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({ id: data.user.id, username: trimmed })
          if (profileError) {
            // Rollback: delete the orphaned auth user if profile creation fails
            try { await supabase.auth.admin?.deleteUser?.(data.user.id) } catch {}
            // Also sign out so the user isn't stuck in a half-created state
            try { await supabase.auth.signOut() } catch {}
            throw new Error('Failed to create profile. Please try again.')
          }
        }

        setSuccess('Account created. You are now signed in.')
        onClose()
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onClose()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text)',
    fontSize: 16,
    padding: '12px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    height: 48,
    transition: 'border-color 0.15s',
  }

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div
        className="modal-panel"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 40,
          width: 400,
          maxWidth: '95vw',
          boxSizing: 'border-box',
        }}
      >
        <div className="sheet-handle" />
        <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 6, letterSpacing: '-0.4px' }}>
          {mode === 'signin' ? 'Sign In' : 'Create Account'}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32 }}>
          {mode === 'signin' ? 'Access your portfolio tracker.' : 'Track your holdings and P&L.'}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {mode === 'signup' && (
            <div>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Username</label>
              <input
                type="text"
                placeholder="letters, numbers, underscores"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                maxLength={30}
                style={inputStyle}
                autoFocus
                onFocus={e => e.target.style.borderColor = 'var(--text)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
              {username.trim().length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  @{username.trim().toLowerCase()}
                </div>
              )}
            </div>
          )}

          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Email</label>
            <input
              type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} required style={inputStyle}
              autoFocus={mode === 'signin'}
              onFocus={e => e.target.style.borderColor = 'var(--text)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Password</label>
            <input
              type="password" placeholder="min. 6 characters" value={password}
              onChange={e => setPassword(e.target.value)} required minLength={6} style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--text)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: 'var(--red)', padding: '10px 14px', background: 'var(--red-bg)', borderRadius: 4 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ fontSize: 13, color: 'var(--green)', padding: '10px 14px', background: 'var(--green-bg)', borderRadius: 4 }}>
              {success}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              background: loading ? 'var(--text-muted)' : 'var(--text)',
              border: 'none',
              borderRadius: 4,
              color: 'var(--bg)',
              fontSize: 14,
              fontWeight: 500,
              padding: '0 24px',
              height: 48,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s',
              marginTop: 8,
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.85' }}
            onMouseLeave={e => { if (!loading) e.currentTarget.style.opacity = '1' }}
          >
            {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setSuccess(''); setUsername('') }}
            style={{
              background: 'none', border: 'none', color: 'var(--text)',
              cursor: 'pointer', fontSize: 13, textDecoration: 'underline',
            }}
          >
            {mode === 'signin' ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  )
}
