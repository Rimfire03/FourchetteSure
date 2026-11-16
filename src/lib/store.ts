import type { Table } from 'dexie'
import { db } from './db'
import { getEtabId, getUser } from './session'

export const uid = () => crypto.randomUUID()

export async function logAudit(entity: string, entityId: string, action: string, detail: unknown = '') {
  const u = getUser()
  await db.audit.add({
    id: uid(), etabId: await getEtabId(), at: Date.now(), userId: u?.id ?? '-', userName: u?.name ?? '-',
    entity, entityId, action, detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
  })
}

/** Create a record (adds id/etab/createdAt) and write an audit row. */
export async function create<T extends { id: string; etabId: string; createdAt: number }>(
  table: Table<T, string>, entity: string, data: Omit<T, 'id' | 'etabId' | 'createdAt'>, summary?: string,
): Promise<T> {
  const rec = { ...data, id: uid(), etabId: await getEtabId(), createdAt: Date.now() } as unknown as T
  await table.add(rec)
  await logAudit(entity, rec.id, 'création', summary ?? '')
  return rec
}

/** Update with audit trail of before/after (piste d'audit des corrections). */
export async function update<T extends { id: string }>(table: Table<T, string>, entity: string, id: string, patch: Partial<T>) {
  const before = await table.get(id)
  if (!before) return
  const diff: Record<string, { avant: unknown; apres: unknown }> = {}
  for (const k of Object.keys(patch) as (keyof T)[]) {
    if (JSON.stringify(before[k]) !== JSON.stringify(patch[k])) diff[k as string] = { avant: before[k], apres: patch[k] }
  }
  await table.update(id, patch as never)
  await logAudit(entity, id, 'modification', diff)
}

async function shrink(file: Blob, max = 1280): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.8))
  } catch { return file }
}

export async function savePhoto(file: Blob): Promise<string> {
  const blob = await shrink(file)
  const id = uid()
  await db.photos.add({ id, blob, createdAt: Date.now() })
  return id
}

export async function photoDataUrl(id: string): Promise<string | undefined> {
  const p = await db.photos.get(id)
  if (!p) return
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(p.blob) })
}

/** Suppression avec trace d'audit (contenu supprimé conservé dans le journal). */
export async function remove<T extends { id: string }>(table: Table<T, string>, entity: string, id: string) {
  const before = await table.get(id)
  await table.delete(id)
  await logAudit(entity, id, 'suppression', before ?? '')
}
