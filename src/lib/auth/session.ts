import { cookies } from 'next/headers'
import { verifyToken, JWTPayload } from './jwt'

/**
 * Get the current user from the JWT cookie in a server component / route handler.
 * Returns null if not authenticated.
 */
export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) return null
  return verifyToken(token)
}
