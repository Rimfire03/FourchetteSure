import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { frDate, frDateTime, pad, reminderState, sampleDisposeDate, ymd } from '../lib/logic'
import { create } from '../lib/store'
import { Badge, Card, Field, Page, PhotoPicker, ReadOnlyNote, Thumbs, useAuth, useCan, useTick } from '../ui'

const DAYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']

export default function Reminders() {
  useTick()
  const now = new Date()
  const today = ymd(now)
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const rows = useLiveQuery(async () => {
    const [rs, logs] = await Promise.all([db.reminders.toArray(), db.taskLogs.where('date').equals(today).toArray()])
    return rs.filter((r) => r.enabled && r.days.includes(now.getDay())).sort((a, b) => a.time.localeCompare(b.time))
      .map((r) => ({ r, log: logs.find((l) => l.reminderId === r.id) }))
  }, [today], [])
  const history = useLiveQuery(() => db.taskLogs.orderBy('createdAt').reverse().limit(30).toArray(), [], [])
  return (
    <Page title="Rappels journaliers">
      {rows.length === 0 && <p className="note">Aucun rappel prévu aujourd’hui. L’administrateur peut en activer dans Paramètres.</p>}
      {rows.map(({ r, log }) => {
        const st = reminderState(r.time, !!log, hm)
        return (
          <Card key={r.id} tone={st === 'late' ? 'red' : st === 'done' ? 'green' : ''}>
            <div className="row sb"><b>{r.time} · {r.title}</b>
              <Badge tone={st === 'done' ? 'green' : st === 'late' ? 'red' : 'orange'}>{st === 'done' ? 'Fait' : st === 'late' ? 'En retard' : 'À venir'}</Badge></div>
            {log ? <span className="note">Validé par {log.userName} à {frDateTime(log.createdAt)}</span>
              : <Link className="btn small" style={{ marginTop: 8 }} to={`/rappels/${r.id}`}>Ouvrir la fiche</Link>}
          </Card>
        )
      })}
      <h2>Historique</h2>
      {history.map((l) => (
        <Card key={l.id}>
          <div className="row sb"><b>{l.title}</b><span className="note">{frDateTime(l.createdAt)}</span></div>
          <div className="note">{l.userName}{l.value ? ` · ${l.value}` : ''}{l.dishes?.length ? ` · ${l.dishes.join(', ')}` : ''}</div>
          {l.disposeAfter && <div className="note">Élimination possible à partir du {frDate(l.disposeAfter)} (0/+3 °C)</div>}
          <Thumbs ids={l.photoIds} />
        </Card>
      ))}
      <p className="note">Jours : {DAYS.join(' ')}</p>
    </Page>
  )
}

export function ReminderTask() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const write = useCan('write')
  const r = useLiveQuery(() => db.reminders.get(id!), [id])
  const [dishes, setDishes] = useState('')
  const [served, setServed] = useState(ymd(new Date()))
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  if (!r) return <Page title="Rappel" back="/rappels"><p>Chargement…</p></Page>
  const isTemoin = r.kind === 'plat_temoin'
  const dishList = dishes.split('\n').map((s) => s.trim()).filter(Boolean)
  const ok = write && (!r.photoRequired || photos.length > 0) && (!isTemoin || dishList.length > 0)
  return (
    <Page title={r.title} back="/rappels">
      {!write && <ReadOnlyNote />}
      {isTemoin && <>
        <Field label="Plats prélevés (un par ligne)"><textarea rows={4} value={dishes} onChange={(e) => setDishes(e.target.value)} placeholder={'Poulet rôti\nHaricots verts'} /></Field>
        <Field label="Date de présentation aux consommateurs" hint={`Conservation 5 jours minimum à 0/+3 °C : élimination possible à partir du ${frDate(sampleDisposeDate(served))}.`}>
          <input type="date" value={served} onChange={(e) => setServed(e.target.value)} />
        </Field>
      </>}
      {r.valueLabel && <Field label={r.valueLabel}><input value={value} inputMode="decimal" onChange={(e) => setValue(e.target.value)} /></Field>}
      <Field label="Remarque"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <PhotoPicker label={isTemoin ? 'Photo des boîtes de prélèvement' : 'Photo'} required={r.photoRequired} ids={photos} onChange={setPhotos} />
      <button className="btn block" disabled={!ok || busy} onClick={async () => {
        setBusy(true)
        await create(db.taskLogs, 'rappel', {
          reminderId: r.id, title: r.title, date: ymd(new Date()), userId: user.id, userName: user.name, photoIds: photos,
          ...(isTemoin ? { dishes: dishList, servedDate: served, disposeAfter: sampleDisposeDate(served) } : {}),
          value: value || undefined, note: note || undefined,
        }, r.title)
        nav('/rappels')
      }}>✔ Valider l’opération</button>
      {r.photoRequired && photos.length === 0 && <p className="note">Photo obligatoire pour valider.</p>}
    </Page>
  )
}
