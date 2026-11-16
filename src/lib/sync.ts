import { useSyncExternalStore } from 'react'
import { db } from './db'

/**
 * Synchronisation hors-ligne d'abord : toute l'appli lit/écrit dans IndexedDB.
 * Les écritures sont mises en file (outbox) par des hooks Dexie, puis envoyées à l'API quand le réseau est là.
 * Résolution des conflits : dernier écrit gagne (champ `_u` par document).
 */
export const DEFAULT_API_URL = 'https://api.rimfire.fr/fourchettesure'
export const SYNCED = ['users', 'reminders', 'taskLogs', 'products', 'deliveries', 'cleaningItems', 'cleaningLogs', 'openRefs', 'opened', 'audit', 'regs'] as const
type Tbl = (typeof SYNCED)[number]

export interface ServerCfg { url: string; token: string; etabId: string; email: string }
export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'auth' | 'error'
export interface SyncStatus { state: SyncState; last?: number; error?: string }

let status: SyncStatus = { state: 'off' }
const listeners = new Set<() => void>()
const setStatus = (s: SyncStatus) => { status = s; listeners.forEach((l) => l()) }
export const useSyncStatus = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => status)

export const getCfg = async () => (await db.settings.get('srv'))?.value as ServerCfg | undefined

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
      if (!applying) (obj as { _u?: number })._u = Date.now()
      this.onsuccess = (k) => queue(t, k)
    })
    table.hook('updating', function (_mods, pk) {
      this.onsuccess = () => queue(t, pk)
      return applying ? undefined : { _u: Date.now() }
    })
    table.hook('deleting', function (pk) { this.onsuccess = () => queue(t, pk) })
  }
}

async function api<T>(cfg: Pick<ServerCfg, 'url'> & { token?: string }, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(cfg.url.replace(/\/$/, '') + path, {
    ...init, signal: AbortSignal.timeout(20_000),
    headers: { ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}), ...(init.headers ?? {}) },
  })
  if (r.status === 401 && cfg.token) throw Object.assign(new Error('auth'), { auth: true })
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`)
  return (r.headers.get('content-type')?.includes('json') ? r.json() : r.blob()) as Promise<T>
}
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export function photoIdsOf(d: Record<string, unknown> | null | undefined): string[] {
  if (!d) return []
  const out: string[] = []
  for (const k of ['photoIds', 'blPhotoIds']) if (Array.isArray(d[k])) out.push(...(d[k] as string[]))
  const an = d.anomaly as { photoIds?: string[] } | undefined
  if (an?.photoIds) out.push(...an.photoIds)
  for (const t of (d.temps as { photoId?: string }[] | undefined) ?? []) if (t.photoId) out.push(t.photoId)
  return out
}

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
    const err = e as Error & { auth?: boolean }
    setStatus(err.auth ? { state: 'auth', last: status.last } : err instanceof TypeError || err.name === 'TimeoutError' ? { state: 'offline', last: status.last } : { state: 'error', last: status.last, error: err.message })
  }
}

async function push(cfg: ServerCfg) {
  for (;;) {
    const rows = await db.outbox.orderBy('at').limit(100).toArray()
    if (!rows.length) return
    const docs = []
    for (const r of rows) {
      const rec = (await db.table(r.tbl).get(r.id)) as ({ _u?: number } & Record<string, unknown>) | undefined
      docs.push(rec ? { tbl: r.tbl, id: r.id, data: rec, updated: rec._u ?? r.at, deleted: false } : { tbl: r.tbl, id: r.id, deleted: true, updated: r.at })
    }
    await api(cfg, '/sync/push', json({ docs }))
    for (const r of rows) { // ne supprime que si non re-modifié pendant l'envoi
      const cur = await db.outbox.get(r.key)
      if (cur && cur.at === r.at) await db.outbox.delete(r.key)
    }
  }
}

async function pushPhotos(cfg: ServerCfg) {
  for (const { id } of await db.photoQueue.toArray()) {
    const p = await db.photos.get(id)
    if (p) await api(cfg, `/photos/${id}`, { method: 'PUT', headers: { 'Content-Type': p.blob.type || 'image/jpeg' }, body: p.blob })
    await db.photoQueue.delete(id)
  }
}

async function pull(cfg: ServerCfg) {
  let since = ((await db.settings.get('srvSeq'))?.value as number) ?? 0
  const wanted = new Set<string>()
  for (;;) {
    const r = await api<{ docs: { tbl: string; id: string; data: (Record<string, unknown> & { _u?: number }) | null; deleted: boolean }[]; seq: number; more: boolean }>(cfg, `/sync/pull?since=${since}&limit=500`)
    applying = true
    try {
      for (const d of r.docs) {
        if (!SYNCED.includes(d.tbl as Tbl)) continue
        const table = db.table(d.tbl)
        if (d.deleted) { await table.delete(d.id); continue }
        const local = (await table.get(d.id)) as { _u?: number } | undefined
        if (local && (local._u ?? 0) > (d.data?._u ?? 0)) continue // l'écriture locale est plus récente : elle sera poussée
        await table.put(d.data)
        photoIdsOf(d.data).forEach((p) => wanted.add(p))
      }
    } finally { applying = false }
    since = r.seq
    await db.settings.put({ key: 'srvSeq', value: since })
    if (!r.more) break
  }
  for (const id of wanted) {
    if (await db.photos.get(id)) continue
    try { await db.photos.put({ id, blob: await api<Blob>(cfg, `/photos/${id}`), createdAt: Date.now() }) } catch { /* photo pas encore sur le serveur */ }
  }
}

const hasLocalData = async () => (await Promise.all(['taskLogs', 'products', 'deliveries', 'cleaningLogs', 'opened'].map((t) => db.table(t).count()))).some((n) => n > 0)

/** Connexion au serveur. Première synchro : serveur vide -> on envoie le local ; sinon le local est remplacé par le serveur. */
export async function connect(o: { url: string; email: string; password: string; mode: 'login' | 'register'; code?: string; etabName?: string; confirmReplace: () => boolean }) {
  const base = { url: o.url.trim().replace(/\/$/, '') }
  const res = await api<{ token: string; etabId: string; etabName: string }>(base, o.mode === 'register' ? '/auth/register' : '/auth/login',
    json({ email: o.email, password: o.password, code: o.code, etabName: o.etabName }))
  const cfg: ServerCfg = { url: base.url, token: res.token, etabId: res.etabId, email: o.email.trim().toLowerCase() }
  const prev = await getCfg()
  if (prev?.etabId === res.etabId) { // simple reconnexion (jeton expiré) : on garde les données locales
    await db.settings.put({ key: 'srv', value: cfg }); enabled = true
    return syncNow()
  }
  const remote = await api<{ docs: unknown[] }>(cfg, '/sync/pull?since=0&limit=1')
  if (remote.docs.length) {
    if (await hasLocalData() && !o.confirmReplace()) throw new Error('Connexion annulée')
    applying = true
    try { for (const t of SYNCED) await db.table(t).clear() } finally { applying = false }
    await db.outbox.clear(); await db.photoQueue.clear()
    await db.settings.put({ key: 'srvSeq', value: 0 })
  } else {
    for (const t of SYNCED) for (const k of await db.table(t).toCollection().primaryKeys()) await db.outbox.put({ key: `${t}:${k}`, tbl: t, id: String(k), at: Date.now() })
    for (const k of await db.photos.toCollection().primaryKeys()) await db.photoQueue.put({ id: String(k) })
    await db.settings.put({ key: 'srvSeq', value: 0 })
  }
  enabled = true
  await db.settings.bulkPut([{ key: 'srv', value: cfg }, { key: 'etabId', value: res.etabId }, { key: 'etabName', value: res.etabName }])
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
