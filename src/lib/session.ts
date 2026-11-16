import { db, type Role, type User } from './db'

let current: User | null = null
export const getUser = () => current
export const setUser = (u: User | null) => {
  current = u
  try { u ? localStorage.setItem('uid', u.id) : localStorage.removeItem('uid') } catch { /* private mode */ }
}
export const restoreUser = async () => {
  try {
    const id = localStorage.getItem('uid')
    const u = id ? await db.users.get(id) : undefined
    current = u?.active ? u : null
  } catch { current = null }
  return current
}
export const can = (role: Role | undefined, action: 'write' | 'configure' | 'users') =>
  !!role && (action === 'write' ? role !== 'viewer' : action === 'configure' ? role === 'admin' || role === 'manager' : role === 'admin')

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('suivi-cuisine:' + s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const getEtabId = async () => ((await db.settings.get('etabId'))?.value as string) ?? 'etab-1'
