import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Check, type Decision, type Temp } from '../lib/db'
import { frDateTime } from '../lib/logic'
import { create } from '../lib/store'
import { Badge, Card, Field, Page, PhotoPicker, ReadOnlyNote, Thumbs, useAuth, useCan } from '../ui'

const CHECKS: [string, string, boolean][] = [
  ['emballages', 'Emballages intacts', false], ['conformes', 'Produits conformes', false], ['dlc', 'DLC suffisantes', false],
  ['temperature', 'Température conforme', true], ['quantites', 'Quantités conformes', false], ['lots', 'Présence des numéros de lots', false],
  ['froid', 'Respect de la chaîne du froid', false],
]
const DEC: Record<Decision, string> = { accepte: 'Accepté', refuse: 'Refusé', reserve: 'Accepté sous réserve' }

export default function Receptions() {
  const write = useCan('write')
  const list = useLiveQuery(() => db.deliveries.orderBy('createdAt').reverse().toArray(), [], [])
  return (
    <Page title="Contrôle réception" actions={write && <Link className="btn small" to="/reception/nouvelle">+ Nouvelle réception</Link>}>
      {list.map((d) => (
        <Card key={d.id} tone={d.anomaly ? 'red' : ''}>
          <div className="row sb"><b>{d.supplier}</b>
            <Badge tone={d.anomaly ? 'red' : 'green'}>{d.anomaly ? DEC[d.anomaly.decision] : 'Conforme'}</Badge></div>
          <div className="note">{frDateTime(d.createdAt)} · BL {d.bl} · {d.userName}{d.driver ? ` · livreur ${d.driver}` : ''}</div>
          {d.temps.map((t, i) => <div key={i} className="note">🌡️ {t.type} — {t.product} : {t.celsius} °C</div>)}
          {d.anomaly && <div style={{ marginTop: 6 }}><b>Non-conformité :</b> {d.anomaly.description}<br /><span className="note">Mesures : {d.anomaly.corrective} · responsable : {d.anomaly.responsible}</span></div>}
          <Thumbs ids={[...d.photoIds, ...d.blPhotoIds, ...(d.anomaly?.photoIds ?? [])]} />
        </Card>
      ))}
      {list.length === 0 && <p className="note">Aucune réception.</p>}
    </Page>
  )
}

export function ReceptionForm() {
  const { user } = useAuth()
  const write = useCan('write')
  const nav = useNavigate()
  const [h, setH] = useState({ supplier: '', driver: '', bl: '' })
  const [photos, setPhotos] = useState<string[]>([])
  const [blPhotos, setBlPhotos] = useState<string[]>([])
  const [checks, setChecks] = useState<Check[]>(CHECKS.map(([key, label]) => ({ key, label, value: undefined as never })))
  const [temps, setTemps] = useState<Temp[]>([])
  const [an, setAn] = useState({ description: '', decision: 'reserve' as Decision, corrective: '', responsible: user.name, photos: [] as string[] })
  const answered = checks.every((c) => c.value)
  const bad = checks.some((c) => c.value === 'non')
  const anomalyOk = !bad || (an.description.trim() && an.corrective.trim() && an.responsible.trim())
  const ok = write && h.supplier.trim() && h.bl.trim() && photos.length > 0 && blPhotos.length > 0 && answered && anomalyOk

  return (
    <Page title="Nouvelle réception" back="/reception">
      {!write && <ReadOnlyNote />}
      <Field label="Fournisseur"><input value={h.supplier} onChange={(e) => setH({ ...h, supplier: e.target.value })} /></Field>
      <Field label="Nom du livreur (facultatif)"><input value={h.driver} onChange={(e) => setH({ ...h, driver: e.target.value })} /></Field>
      <Field label="Numéro du bon de livraison"><input value={h.bl} onChange={(e) => setH({ ...h, bl: e.target.value })} /></Field>
      <PhotoPicker label="Photo générale de la livraison" required ids={photos} onChange={setPhotos} />
      <PhotoPicker label="Photo du bon de livraison" required ids={blPhotos} onChange={setBlPhotos} />

      <h2>Contrôles</h2>
      {checks.map((c, i) => {
        const na = CHECKS[i][2]
        return (
          <div key={c.key} className="field"><span>{c.label}</span>
            <div className="yn">
              {(['oui', 'non', ...(na ? ['na'] : [])] as Check['value'][]).map((v) => (
                <label key={v} className={c.value === v ? `on-${v}` : ''}>
                  <input type="radio" name={c.key} onChange={() => setChecks(checks.map((x, j) => (j === i ? { ...x, value: v } : x)))} />
                  {v === 'oui' ? 'Oui' : v === 'non' ? 'Non' : 'N/A'}
                </label>
              ))}
            </div>
          </div>
        )
      })}

      <h2>Températures</h2>
      {temps.map((t, i) => (
        <Card key={i}>
          <Field label="Type de produit contrôlé"><input value={t.type} onChange={(e) => setTemps(temps.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} /></Field>
          <Field label="Produit sondé"><input value={t.product} onChange={(e) => setTemps(temps.map((x, j) => (j === i ? { ...x, product: e.target.value } : x)))} /></Field>
          <Field label="Température mesurée (°C)"><input type="number" step="0.1" value={Number.isNaN(t.celsius) ? '' : t.celsius} onChange={(e) => setTemps(temps.map((x, j) => (j === i ? { ...x, celsius: e.target.valueAsNumber } : x)))} /></Field>
          <PhotoPicker label="Photo du thermomètre (facultatif)" ids={t.photoId ? [t.photoId] : []} onChange={(ids) => setTemps(temps.map((x, j) => (j === i ? { ...x, photoId: ids[ids.length - 1] } : x)))} />
          <button type="button" className="btn danger small" onClick={() => setTemps(temps.filter((_, j) => j !== i))}>Retirer</button>
        </Card>
      ))}
      <button type="button" className="btn secondary" onClick={() => setTemps([...temps, { type: '', product: '', celsius: NaN }])}>+ Ajouter une température</button>

      {bad && (
        <Card tone="red">
          <h3>⚠ Non-conformité</h3>
          <Field label="Description du problème"><textarea rows={3} value={an.description} onChange={(e) => setAn({ ...an, description: e.target.value })} /></Field>
          <PhotoPicker label="Photo de l’anomalie" ids={an.photos} onChange={(p) => setAn({ ...an, photos: p })} />
          <Field label="Décision"><select value={an.decision} onChange={(e) => setAn({ ...an, decision: e.target.value as Decision })}>
            {(Object.keys(DEC) as Decision[]).map((d) => <option key={d} value={d}>{DEC[d]}</option>)}</select></Field>
          <Field label="Mesures correctives"><textarea rows={2} value={an.corrective} onChange={(e) => setAn({ ...an, corrective: e.target.value })} /></Field>
          <Field label="Responsable"><input value={an.responsible} onChange={(e) => setAn({ ...an, responsible: e.target.value })} /></Field>
        </Card>
      )}
      <p className="note">Validation possible après : photo livraison, photo bon, tous les contrôles renseignés.</p>
      <button className="btn block" disabled={!ok} onClick={async () => {
        await create(db.deliveries, 'réception', {
          supplier: h.supplier.trim(), driver: h.driver.trim() || undefined, bl: h.bl.trim(), userId: user.id, userName: user.name,
          photoIds: photos, blPhotoIds: blPhotos, checks, temps: temps.filter((t) => t.type || t.product || !Number.isNaN(t.celsius)),
          anomaly: bad ? { description: an.description, photoIds: an.photos, decision: an.decision, corrective: an.corrective, responsible: an.responsible } : undefined,
        }, `${h.supplier} BL ${h.bl}`)
        nav('/reception')
      }}>✔ Valider la livraison</button>
    </Page>
  )
}
