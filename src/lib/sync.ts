import { useSyncExternalStore } from 'react'
import { db } from './db'

/**
 * Synchronisation hors-ligne d'abord : toute l'appli lit/écrit dans IndexedDB.
 * Les écritures sont mises en file (outbox) par des hooks Dexie, puis envoyées à l'API globale api-tlpc
 * (https://api.tlpc.fr/<appli>) quand le réseau est là. Dernier écrit gagne (champ `_u` par document).
 * Un compte serveur = un établissement (partagé entre ses appareils) ; les profils PIN sont synchronisés dans `users`.
 */
export const DEFAULT_API_URL = 'https://api.tlpc.fr/fourchettesure'
export const SYNCED = ['users', 'reminders', 'taskLogs', 'products', 'deliveries', 'cleaningItems', 'cleaningLogs', 'openRefs', 'opened', 'audit', 'regs'] as const
type Tbl = (typeof SYNCED)[number]

export interface ServerCfg { url: string; access: string; refresh: string; email: string }
export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'auth' | 'error'
export interface SyncStatus { state: SyncState; last?: number; error?: string }
type Doc = Record<string, unknown> & { _u?: number; _deleted?: boolean }

let status: SyncStatus = { state: 'off' }
const listeners = new Set<() => void>()
const setStatus = (s: SyncStatus) => { status = s; listeners.forEach((l) => l()) }
export const useSyncStatus = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => status)

export const getCfg = async () => (await db.settings.get('srv'))?.value as ServerCfg | undefined
const saveCfg = (c: ServerCfg) => db.settings.put({ key: 'srv', value: c })

let applying = false
let enabled = false // pas de file d'attente tant qu'aucun serveur n'est connecté (connect() remplit tout à la connexion)
let timer: ReturnType<typeof setTimeout> | undefined
export const schedule = (ms = 3000) => { if (timer) clearTimeout(timer); timer = setTimeout(() => void syncNow(), ms) }

function queue(tbl: string, id: unknown) {
  if (applying || !enabled) return
  void db.outbox.put({ key: `${tbl}:${id}`, tbl, id: String(id), at: Date.now() }).then(() => schedule())
}

export function installHooks() {
  for (const t of SYNCED) {
    const table = db.table(t)
    table.hook('creating', function (_pk, obj) {
      if (!applying) (obj as Doc)._u = Date.now()
      this.onsuccess = (k) => queue(t, k)
    })
    table.hook('updating', function (_mods, pk) {
      this.onsuccess = () => queue(t, pk)
      return applying ? undefined : { _u: Date.now() }
    })
    table.hook('deleting', function (pk) { this.onsuccess = () => queue(t, pk) })
  }
}

// ---- HTTP -----------------------------------------------------------------------------------------------------------
class AuthError extends Error {}
const raw = (url: string, path: string, init: RequestInit & { token?: string } = {}) =>
  fetch(url.replace(/\/$/, '') + path, {
    ...init, signal: AbortSignal.timeout(20_000),
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
  })
const fail = async (r: Response) => new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`)

/** Appel authentifié ; sur 401 tente un refresh (jeton à rotation) puis rejoue une fois. */
async function call<T>(cfg: ServerCfg, path: string, init: RequestInit = {}, okEmpty = false): Promise<T> {
  let r = await raw(cfg.url, path, { ...init, token: cfg.access })
  if (r.status === 401) {
    const rr = await raw(cfg.url, '/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh: cfg.refresh }) })
    if (!rr.ok) throw new AuthError('auth')
    const t = (await rr.json()) as { access: string; refresh: string }
    cfg.access = t.access; cfg.refresh = t.refresh
    await saveCfg(cfg)
    r = await raw(cfg.url, path, { ...init, token: cfg.access })
    if (r.status === 401) throw new AuthError('auth')
  }
  if (okEmpty && (r.status === 404 || r.status === 204)) return undefined as T
  if (!r.ok) throw await fail(r)
  return (r.status === 204 ? undefined : await r.json()) as T
}

const put = (cfg: ServerCfg, coll: string, id: string, body: unknown) =>
  call(cfg, `/data/${coll}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) })

export function photoIdsOf(d: Doc | null | undefined): string[] {
  if (!d) return []
  const out: string[] = []
  for (const k of ['photoIds', 'blPhotoIds']) if (Array.isArray(d[k])) out.push(...(d[k] as string[]))
  const an = d.anomaly as { photoIds?: string[] } | undefined
  if (an?.photoIds) out.push(...an.photoIds)
  for (const t of (d.temps as { photoId?: string }[] | undefined) ?? []) if (t.photoId) out.push(t.photoId)
  return out
}

const toB64 = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(b) })

// ---- Synchro ---------------------------------------------------------------------------------------------------------
let running: Promise<void> | undefined
export const syncNow = (): Promise<void> => (running ??= doSync().finally(() => { running = undefined }))

async function doSync() {
  const cfg = await getCfg()
  if (!cfg) return setStatus({ state: 'off' })
  if (!navigator.onLine) return setStatus({ state: 'offline', last: status.last })
  setStatus({ state: 'syncing', last: status.last })
  try {
    await push(cfg)
    await pushPhotos(cfg)
    await pull(cfg)
    setStatus({ state: 'idle', last: Date.now() })
  } catch (e) {
    const err = e as Error
    setStatus(err instanceof AuthError ? { state: 'auth', last: status.last }
      : err instanceof TypeError || err.name === 'TimeoutError' ? { state: 'offline', last: status.last }
        : { state: 'error', last: status.last, error: err.message })
  }
}

async function push(cfg: ServerCfg) {
  for (;;) {
    const rows = await db.outbox.orderBy('at').limit(50).toArray()
    if (!rows.length) return
    for (const r of rows) {
      const rec = (await db.table(r.tbl).get(r.id)) as Doc | undefined
      // suppression = document « pierre tombale » (l'API n'a pas de delta de suppressions)
      await put(cfg, r.tbl, r.id, rec ?? { _deleted: true, _u: r.at })
      const cur = await db.outbox.get(r.key) // ne supprime que si non re-modifié pendant l'envoi
      if (cur && cur.at === r.at) await db.outbox.delete(r.key)
    }
  }
}

async function pushPhotos(cfg: ServerCfg) {
  for (const { id } of await db.photoQueue.toArray()) {
    const p = await db.photos.get(id)
    if (p) {
      const b64 = await toB64(p.blob)
      if (b64.length < 900_000) await put(cfg, 'photos', id, { mime: p.blob.type || 'image/jpeg', b64 }) // l'API limite le corps à 1 Mo
    }
    await db.photoQueue.delete(id)
  }
}

type Row = { id: string; data: Doc; updated_at: string }

async function pull(cfg: ServerCfg) {
  const marks = (((await db.settings.get('srvPull'))?.value) ?? {}) as Record<string, string>
  const wanted = new Set<string>()
  for (const t of SYNCED) {
    const mark = marks[t] ?? ''
    let newest = mark
    // La liste est triée par updated_at décroissant : on s'arrête dès qu'on rejoint la dernière synchro.
    for (let offset = 0, stop = false; !stop; offset += 200) {
      const rows = await call<Row[]>(cfg, `/data/${t}?limit=200&offset=${offset}`)
      if (offset === 0 && rows[0] && rows[0].updated_at > newest) newest = rows[0].updated_at
      applying = true
      try {
        for (const r of rows) {
          if (mark && r.updated_at < mark) { stop = true; break }
          const table = db.table(t)
          if (r.data._deleted) { await table.delete(r.id); continue }
          const local = (await table.get(r.id)) as Doc | undefined
          if (local && (local._u ?? 0) > (r.data._u ?? 0)) continue // l'écriture locale est plus récente : elle sera poussée
          await table.put(r.data)
          photoIdsOf(r.data).forEach((p) => wanted.add(p))
        }
      } finally { applying = false }
      if (rows.length < 200) stop = true
    }
    marks[t] = newest
    await db.settings.put({ key: 'srvPull', value: { ...marks } })
  }
  for (const id of wanted) {
    if (await db.photos.get(id)) continue
    const p = await call<{ data: { mime: string; b64: string } } | undefined>(cfg, `/data/photos/${encodeURIComponent(id)}`, {}, true).catch(() => undefined)
    if (p?.data?.b64) await db.photos.put({ id, blob: await (await fetch(`data:${p.data.mime};base64,${p.data.b64}`)).blob(), createdAt: Date.now() })
  }
}

const hasLocalData = async () => (await Promise.all(['taskLogs', 'products', 'deliveries', 'cleaningLogs', 'opened'].map((t) => db.table(t).count()))).some((n) => n > 0)

/** Connexion. Première synchro : serveur vide -> on envoie le local ; sinon le local est remplacé par le serveur. */
export async function connect(o: { url: string; email: string; password: string; mode: 'login' | 'register'; confirmReplace: () => boolean }) {
  const url = o.url.trim().replace(/\/$/, '')
  const r = await raw(url, o.mode === 'register' ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify({ email: o.email.trim(), password: o.password }) })
  if (!r.ok) throw await fail(r)
  const tk = (await r.json()) as { access: string; refresh: string }
  const email = o.email.trim().toLowerCase()
  const cfg: ServerCfg = { url, access: tk.access, refresh: tk.refresh, email }

  const prev = await getCfg()
  if (prev?.email === email && prev.url === url) { // simple reconnexion : on garde les données locales
    await saveCfg(cfg); enabled = true
    return syncNow()
  }
  const remote = await call<Row[]>(cfg, '/data/users?limit=1')
  if (remote.length) {
    if (await hasLocalData() && !o.confirmReplace()) throw new Error('Connexion annulée')
    applying = true
    try { for (const t of SYNCED) await db.table(t).clear() } finally { applying = false }
    await db.outbox.clear(); await db.photoQueue.clear()
  } else {
    for (const t of SYNCED) for (const k of await db.table(t).toCollection().primaryKeys()) await db.outbox.put({ key: `${t}:${k}`, tbl: t, id: String(k), at: Date.now() })
    for (const k of await db.photos.toCollection().primaryKeys()) await db.photoQueue.put({ id: String(k) })
  }
  await db.settings.put({ key: 'srvPull', value: {} })
  enabled = true
  await saveCfg(cfg)
  await syncNow()
}

export async function disconnect() {
  enabled = false
  await db.settings.delete('srv')
  await db.outbox.clear(); await db.photoQueue.clear()
  setStatus({ state: 'off' })
}

export async function startSync() {
  installHooks()
  enabled = !!(await getCfg())
  window.addEventListener('online', () => void syncNow())
  setInterval(() => void syncNow(), 60_000)
  void syncNow()
}
