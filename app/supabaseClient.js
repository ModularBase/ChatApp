// supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASEURL
const supabaseAnonKey = process.env.SUPABASEANONKEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { enabled: true }
})
