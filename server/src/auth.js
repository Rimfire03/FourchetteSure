import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

export async function hashPassword(pw) {
  const salt = randomBytes(16)
  const key = await scryptAsync(pw, salt, 64)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

export async function verifyPassword(pw, stored) {
  const [saltHex, keyHex] = String(stored).split(':')
  if (!saltHex || !keyHex) return false
  const key = await scryptAsync(pw, Buffer.from(saltHex, 'hex'), 64)
  const expected = Buffer.from(keyHex, 'hex')
  return key.length === expected.length && timingSafeEqual(key, expected)
}

export const newToken = () => randomBytes(32).toString('base64url')
export const hashToken = (t) => createHash('sha256').update(t).digest('hex')

/** Limiteur simple en mémoire : max `max` essais par clé sur `windowMs`. */
export function makeLimiter(max, windowMs) {
  const hits = new Map()
  return (key) => {
    const now = Date.now()
    const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    arr.push(now)
    hits.set(key, arr)
    return arr.length <= max
  }
}
