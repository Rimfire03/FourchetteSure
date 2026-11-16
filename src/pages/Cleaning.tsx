import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type CleaningItem } from '../lib/db'
import { cleaningStatus, FREQ_LABEL, frDate, frDateTime, ymd, type Light } from '../lib/logic'
import { create } from '../lib/store'
import { Badge, Card, Field, Page, PhotoPicker, Thumbs, useAuth, useCan } from '../ui'

const LABEL: Record<Light, string> = { green: 'Fait', orange: 'À faire', red: 'En retard' }
const ORDER: Record<Light, number> = { red: 0, orange: 1, green: 2 }

export default function Cleaning() {
  const today = ymd(new Date())
  const [open, setOpen] = useState<string>()
  const rows = useLiveQuery(async () => {
    const [items, logs] = await Promise.all([db.cleaningItems.filter((i) => i.active).toArray(), db.cleaningLogs.toArray()])
    return items.map((it) => {
      const mine = logs.filter((l) => l.itemId === it.id).map((l) => l.date).sort()
      return { it, ...cleaningStatus(it, mine[mine.length - 1], today) }
    }).sort((a, b) => ORDER[a.light] - ORDER[b.light] || a.it.zone.localeCompare(b.it.zone))
  }, [today], [])
  const history = useLiveQuery(() => db.cleaningLogs.orderBy('createdAt').reverse().limit(30).toArray(), [], [])
  return (
    <Page title="Plan de nettoyage">
      <div className="row">
        {(['red', 'orange', 'green'] as Light[]).map((l) => <span key={l}><i className={`dot ${l}`} /> {LABEL[l]} ({rows.filter((r) => r.light === l).length})</span>)}
      </div>
      {rows.map(({ it, light, nextDue }) => (
        <Card key={it.id} tone={light === 'red' ? 'red' : light === 'orange' ? 'orange' : 'green'}>
          <div className="row sb" onClick={() => setOpen(open === it.id ? undefined : it.id)} style={{ cursor: 'pointer' }}>
            <div><b>{it.zone}</b><div className="note">{FREQ_LABEL[it.frequency]}{it.frequency === 'custom' ? ` (${it.customDays} j)` : ''} · échéance {frDate(nextDue)}{it.photoRequired ? ' · 📷 photo requise' : ''}</div></div>
            <Badge tone={light}>{LABEL[light]}</Badge>
          </div>
          {open === it.id && <DoneForm item={it} onDone={() => setOpen(undefined)} />}
        </Card>
      ))}
      <h2>Historique</h2>
      {history.map((l) => (
        <Card key={l.id}><div className="row sb"><b>{l.zone}</b><span className="note">{frDateTime(l.createdAt)}</span></div>
          <div className="note">{l.userName}{l.product ? ` · ${l.product}` : ''}{l.dilution ? ` ${l.dilution}` : ''}{l.contactMin ? ` · contact ${l.contactMin} min` : ''}{l.rinsed ? ' · rincé' : ''}</div>
          <Thumbs ids={l.photoIds} /></Card>
      ))}
    </Page>
  )
}

function DoneForm({ item, onDone }: { item: CleaningItem; onDone: () => void }) {
  const { user } = useAuth()
  const write = useCan('write')
  const [product, setProduct] = useState(item.product ?? '')
  const [dilution, setDilution] = useState(item.dilution ?? '')
  const [contact, setContact] = useState(item.contactMin ?? '')
  const [rinsed, setRinsed] = useState(item.rinse)
  const [photos, setPhotos] = useState<string[]>([])
  const ok = write && (!item.photoRequired || photos.length > 0)
  return (
    <div>
      <Field label="Produit utilisé"><input value={product} onChange={(e) => setProduct(e.target.value)} /></Field>
      <div className="row">
        <Field label="Dosage / dilution"><input value={dilution} onChange={(e) => setDilution(e.target.value)} /></Field>
        <Field label="Temps de contact (min)"><input value={contact} inputMode="numeric" onChange={(e) => setContact(e.target.value)} /></Field>
      </div>
      <label className="row"><input type="checkbox" checked={rinsed} onChange={(e) => setRinsed(e.target.checked)} /> Rinçage effectué</label>
      <PhotoPicker label="Photo" required={item.photoRequired} ids={photos} onChange={setPhotos} />
      <button className="btn block" disabled={!ok} onClick={async () => {
        await create(db.cleaningLogs, 'nettoyage', {
          itemId: item.id, zone: item.zone, date: ymd(new Date()), userId: user.id, userName: user.name,
          product: product || undefined, dilution: dilution || undefined, contactMin: contact || undefined, rinsed, photoIds: photos,
        }, item.zone)
        onDone()
      }}>✔ Nettoyage terminé</button>
    </div>
  )
}
