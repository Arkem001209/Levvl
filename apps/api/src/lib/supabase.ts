// SERVICE ROLE client — bypasses Row Level Security (RLS).
// NEVER expose the service role key or this client to the frontend.
// Use this only in backend services that need to write data on behalf of users.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.API_SUPABASE_URL
const supabaseServiceKey = process.env.API_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing API_SUPABASE_URL or API_SUPABASE_SERVICE_ROLE_KEY in environment')
}

// The Database generic lets TypeScript know the shape of your tables.
// Once you run `supabase gen types typescript --project-id <id> > supabase/types.ts`,
// import that generated Database type and replace the second type argument below.
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    // The backend doesn't need to manage user sessions — it just verifies tokens
    autoRefreshToken: false,
    persistSession: false,
  },
})
