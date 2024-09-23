// supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.supabaseUrl
const supabaseAnonKey = process.env.Anon_Key

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { enabled: true }
})
