/**
 * Dev script: generates a short-lived JWT for the test user.
 * Uses the service role key to create a session without needing a password.
 *
 * Run from apps/api:
 *   npx tsx scripts/get-test-jwt.ts
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const USER_ID = 'd853bc6b-559b-476b-b4ab-c9031ec0b79f'

const supabase = createClient(
  process.env.API_SUPABASE_URL!,
  process.env.API_SUPABASE_SERVICE_ROLE_KEY!
)

async function main(): Promise<void> {
  // Step 1: look up the user's email by UUID
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(USER_ID)
  if (userError) throw new Error(`getUserById failed: ${userError.message}`)

  const email = userData.user.email!

  // Step 2: generate a magic link — gives us a signed token without needing a password
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError) throw new Error(`generateLink failed: ${linkError.message}`)

  // Step 3: extract the token_hash from the action link URL
  const actionUrl  = new URL(linkData.properties.action_link)
  const tokenHash  = actionUrl.searchParams.get('token')!

  // Step 4: exchange the token for a real session via the Supabase auth REST API
  const verifyRes = await fetch(
    `${process.env.API_SUPABASE_URL}/auth/v1/verify?token=${tokenHash}&type=magiclink`,
    { method: 'GET', redirect: 'manual' }
  )

  // The verify endpoint redirects to the app with the session in the URL fragment.
  // We need the access_token from the redirect location header instead.
  const location = verifyRes.headers.get('location') ?? ''
  const fragment = new URL(location.replace('#', '?'), 'http://localhost')
  const accessToken = fragment.searchParams.get('access_token')

  if (!accessToken) {
    // Fall back: use verifyOtp which returns the session directly
    const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email',
    })
    if (otpError || !otpData.session) throw new Error(`verifyOtp failed: ${otpError?.message}`)

    console.log('\nCopy this header for curl:\n')
    console.log(`Authorization: Bearer ${otpData.session.access_token}\n`)
    return
  }

  console.log('\nCopy this header for curl:\n')
  console.log(`Authorization: Bearer ${accessToken}\n`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
