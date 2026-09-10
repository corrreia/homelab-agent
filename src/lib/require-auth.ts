import { auth, authDisabled } from './auth'
import { getRequestHeaders } from '@tanstack/react-start/server'

export async function requireApiSession(request: Request) {
  if (authDisabled) return null
  const session = await auth.api.getSession({ headers: new Headers(request.headers) })

  if (!session) {
    throw Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return session
}

export async function requireCurrentSession() {
  if (authDisabled) return null
  const session = await auth.api.getSession({ headers: new Headers(getRequestHeaders()) })

  if (!session) {
    throw new Error('Unauthorized')
  }

  return session
}
