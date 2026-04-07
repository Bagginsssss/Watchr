import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

let _client = null
try {
  if (url && key && url.startsWith('http')) {
    _client = createClient(url, key)
  }
} catch (e) {
  console.warn('Supabase init failed:', e.message)
}

export const supabase = _client
export const supabaseReady = _client !== null
