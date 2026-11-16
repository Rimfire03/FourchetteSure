import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type OpenRef } from '../lib/db'
import { addDays, expiryState, frDate, frDateTime, ymd, type ExpiryState } from '../lib/logic'
import { create, update } from '../lib/store'
import { Badge, Card, Field, Page, ReadOnlyNote, useAuth, useCan } from '../ui'

const TONE: Record<ExpiryState, 'green' | 'orange' | 'red'> = { ok: 'green', eve: 'orange', today: 'orange', expired: 'red' }
const TXT: Record<ExpiryState, string> = { ok: 'À surveiller', eve: 'Demain', today: 'Aujourd’hui', expired: 'Dépassé' }

export default function OpenDates() {
  const { user } = useAuth()
  const write = useCan('write')
  const today = ymd(new Date())
  const [adding, setAdding] = useState(false)
  const open = useLiveQuery(() => db.opened.where('status').equals('open').sortBy('dueYmd'), [], [])
  const closed = useLiveQuery(() => db.opened.where('status').notEqual('open').reverse().limit(15).sortBy('closedAt'), [], [])
  return (
    <Page title="Dates après ouverture" actions={write && <button className="btn small" onClick={() => setAdding(!adding)}>+ Ouvrir un produit</button>}>
      {!write && <ReadOnlyNote />}
      {adding && <OpenForm onDone={() => setAdding(false)} />}
      {open.map((o) => {
        const s = expiryState(o.dueYmd, today)
        return (
          <Card key={o.id} tone={s === 'expired' ? 'red' : s === 'ok' ? 'green' : 'orange'}>
            <div className="row sb"><b>{o.name}</b><Badge tone={TONE[s]}>{TXT[s]}</Badge></div>
            <dl>
              <dt>Ouvert le</dt><dd>{frDateTime(o.openedAt)} ({o.userName})</dd>
              <dt>Durée paramétrée</dt><dd>J+{o.days}{o.tempC ? ` · ${o.tempC}` : ''}</dd>
              <dt>Date limite calculée</dt><dd><b>{frDate(o.dueYmd)}</b></dd>
              <dt>Quantité ouverte</dt><dd>{o.quantity}</dd>
            </dl>
            {write && <div className="row">
              <button className="btn secondary small" onClick={() => closeItem(o.id, 'finished', user.name)}>Terminé</button>
              <button className="btn danger small" onClick={() => closeItem(o.id, 'discarded', user.name)}>Jeté</button>
            </div>}
          </Card>
        )
      })}
      {open.length === 0 && <p className="note">Aucun produit ouvert suivi.</p>}
      {closed.length > 0 && <><h2>Clôturés</h2>
        {closed.map((o) => <Card key={o.id}><b>{o.name}</b> <Badge tone="grey">{o.status === 'finished' ? 'Terminé' : 'Jeté'}</Badge>
          <div className="note">{o.closedAt ? frDateTime(o.closedAt) : ''} · {o.closedBy}</div></Card>)}</>}
    </Page>
  )
}

const closeItem = (id: string, status: 'finished' | 'discarded', by: string) =>
  update(db.opened, 'produit ouvert', id, { status, closedAt: Date.now(), closedBy: by })

function OpenForm({ onDone }: { onDone: () => void }) {
  const { user } = useAuth()
  const refs = useLiveQuery(() => db.openRefs.orderBy('name').toArray(), [], [] as OpenRef[])
  const [refId, setRefId] = useState('')
  const [qty, setQty] = useState('1')
  const [days, setDays] = useState('')
  const ref = refs.find((r) => r.id === refId)
  const d = ref?.days ?? (Number(days) || 0)
  const ok = ref && d > 0 && qty.trim()
  return (
    <Card>
      <Field label="Produit"><select value={refId} onChange={(e) => { setRefId(e.target.value); setDays('') }}>
        <option value="">— choisir —</option>{refs.map((r) => <option key={r.id} value={r.id}>{r.family} · {r.name}</option>)}</select></Field>
      {ref && !ref.days && <Field label="Durée après ouverture (jours)" hint={`Non paramétrée (${ref.source ?? 'à vérifier'}). Lisez l’étiquette du fabricant ou la procédure validée.`}>
        <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} /></Field>}
      {ref?.conditions && <p className="note">{ref.conditions}</p>}
      <Field label="Quantité ouverte"><input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="2 poches" /></Field>
      {ok && <p>Date limite : <b>{frDate(addDays(ymd(new Date()), d))}</b> (J+{d})</p>}
      <button className="btn block" disabled={!ok} onClick={async () => {
        const now = new Date()
        await create(db.opened, 'produit ouvert', {
          refId: ref!.id, name: ref!.name, openedAt: now.getTime(), openedYmd: ymd(now), days: d, dueYmd: addDays(ymd(now), d),
          quantity: qty, tempC: ref!.tempC, userId: user.id, userName: user.name, status: 'open',
        }, ref!.name)
        onDone()
      }}>Confirmer l’ouverture (date et heure maintenant)</button>
    </Card>
  )
}
