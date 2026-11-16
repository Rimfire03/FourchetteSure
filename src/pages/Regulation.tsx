import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type RegSheet } from '../lib/db'
import { diffDays, frDate, ymd } from '../lib/logic'
import { create, update } from '../lib/store'
import { Card, Field, Page, useCan } from '../ui'

export default function Regulation() {
  const admin = useCan('configure')
  const sheets = useLiveQuery(() => db.regs.toArray(), [], [] as RegSheet[])
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<string>()
  const s = q.toLowerCase()
  const list = sheets.filter((x) => !s || JSON.stringify(x).toLowerCase().includes(s))
  const oldest = sheets.map((x) => x.updated).sort()[0]
  const stale = oldest && diffDays(ymd(new Date()), oldest) > 31
  return (
    <Page title="Réglementation" actions={admin && <button className="btn small" onClick={async () => { const r = await create(db.regs, 'fiche', { theme: 'Nouveau thème', title: 'Nouvelle fiche', explanation: '', rule: '', example: '', reference: '', updated: ymd(new Date()) }); setEdit(r.id) }}>+ Fiche</button>}>
      {stale && <Card tone="orange"><b>Veille mensuelle :</b> des fiches n’ont pas été revues depuis plus d’un mois. Vérifiez les textes en vigueur puis mettez à jour.</Card>}
      <p className="note">Aide-mémoire. Les durées et procédures sont à valider par le responsable de la cuisine selon son analyse des dangers (PMS).</p>
      <Field label="Rechercher"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      {list.sort((a, b) => a.theme.localeCompare(b.theme)).map((x) => (edit === x.id ? <Editor key={x.id} sheet={x} onDone={() => setEdit(undefined)} /> : (
        <Card key={x.id}>
          <small className="note">{x.theme}</small>
          <h2>{x.title}</h2>
          <dl>
            <dt>En clair</dt><dd>{x.explanation}</dd>
            <dt>Règle applicable</dt><dd>{x.rule}</dd>
            <dt>Exemple pratique</dt><dd>{x.example}</dd>
            <dt>Référence</dt><dd>{x.reference}</dd>
          </dl>
          <div className="row sb"><span className="note">Mis à jour le {frDate(x.updated)}</span>
            {admin && <span className="row"><button className="btn secondary small" onClick={() => update(db.regs, 'fiche', x.id, { updated: ymd(new Date()) })}>Revue OK</button>
              <button className="btn secondary small" onClick={() => setEdit(x.id)}>Modifier</button></span>}</div>
        </Card>
      )))}
    </Page>
  )
}

function Editor({ sheet, onDone }: { sheet: RegSheet; onDone: () => void }) {
  const [v, setV] = useState(sheet)
  const k = (key: keyof RegSheet, label: string, area = true) => (
    <Field label={label}>{area ? <textarea rows={3} value={v[key] as string} onChange={(e) => setV({ ...v, [key]: e.target.value })} />
      : <input value={v[key] as string} onChange={(e) => setV({ ...v, [key]: e.target.value })} />}</Field>
  )
  return (
    <Card>
      {k('theme', 'Thème', false)}{k('title', 'Titre', false)}{k('explanation', 'Explication')}{k('rule', 'Règle')}{k('example', 'Exemple')}{k('reference', 'Référence', false)}
      <div className="row"><button className="btn" onClick={async () => { await update(db.regs, 'fiche', sheet.id, { ...v, updated: ymd(new Date()) }); onDone() }}>Enregistrer</button>
        <button className="btn secondary" onClick={onDone}>Annuler</button></div>
    </Card>
  )
}
