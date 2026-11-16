import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, PROD_CAT_LABEL, type MeatOrigin, type ProdCat } from '../lib/db'
import { frDate, frDateTime, ymd } from '../lib/logic'
import { ocrLabel } from '../lib/ocr'
import { create } from '../lib/store'
import { Badge, Card, Field, Page, PhotoPicker, ReadOnlyNote, Thumbs, useAuth, useCan } from '../ui'

export default function Products() {
  const write = useCan('write')
  const [q, setQ] = useState('')
  const [day, setDay] = useState('')
  const all = useLiveQuery(() => db.products.orderBy('openedAt').reverse().toArray(), [], [])
  const s = q.trim().toLowerCase()
  const list = all.filter((p) =>
    (!s || [p.name, p.lot, p.supplier].some((v) => v?.toLowerCase().includes(s))) &&
    (!day || ymd(new Date(p.openedAt)) === day))
  const lotHits = s ? all.filter((p) => p.lot.toLowerCase() === s) : []
  return (
    <Page title="Traçabilité produits" actions={write && <Link className="btn small" to="/produits/nouveau">+ Ajouter</Link>}>
      <Field label="Rechercher (nom, n° de lot, fournisseur)"><input value={q} onChange={(e) => setQ(e.target.value)} type="search" /></Field>
      <Field label="Produits ouverts le"><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
      {lotHits.length > 0 && (
        <Card tone="orange"><b>Lot « {lotHits[0].lot} » : {lotHits.length} produit(s) concerné(s)</b>
          <div className="note">{[...new Set(lotHits.map((p) => p.supplier || 'fournisseur inconnu'))].join(', ')} · ouverts du {frDate(ymd(new Date(lotHits[lotHits.length - 1].openedAt)))} au {frDate(ymd(new Date(lotHits[0].openedAt)))}</div></Card>
      )}
      {list.map((p) => (
        <Card key={p.id}>
          <div className="row sb"><b>{p.name}</b><Badge tone="grey">{PROD_CAT_LABEL[p.category]}</Badge></div>
          <div className="note">
            {p.dlcType} {frDate(p.dlc) || '—'} · lot {p.lot || '—'} · {p.supplier || 'fournisseur ?'}{p.country ? ` · ${p.country}` : ''}<br />
            {p.pouches} ouvert(s) · {frDateTime(p.openedAt)} · {p.userName}
          </div>
          {p.isMeat && p.meat && <div className="note">Viande — né: {p.meat.born || '—'} · élevé: {p.meat.raised || '—'} · abattu: {p.meat.slaughtered || '—'} · découpé: {p.meat.cut || '—'} · origine: {p.meat.origin || '—'}</div>}
          <Thumbs ids={p.photoIds} />
        </Card>
      ))}
      {list.length === 0 && <p className="note">Aucun produit trouvé.</p>}
    </Page>
  )
}

export function ProductForm() {
  const { user } = useAuth()
  const write = useCan('write')
  const nav = useNavigate()
  const [photos, setPhotos] = useState<string[]>([])
  const [last, setLast] = useState<Blob>()
  const [ocr, setOcr] = useState<{ busy?: boolean; err?: string; text?: string }>({})
  const [f, setF] = useState({ name: '', dlcType: 'DLC' as 'DLC' | 'DDM', dlc: '', lot: '', supplier: '', country: '', category: 'frais' as ProdCat, pouches: 1, isMeat: false })
  const [meat, setMeat] = useState<MeatOrigin>({})
  const set = (k: keyof typeof f, v: string | number | boolean) => setF((x) => ({ ...x, [k]: v }))
  const ok = write && photos.length > 0 && f.name.trim() && f.pouches > 0

  async function runOcr() {
    if (!last) return
    setOcr({ busy: true })
    try {
      const { text, guess } = await ocrLabel(last)
      setF((x) => ({
        ...x, name: x.name || guess.name || '', dlc: x.dlc || guess.dlc || '', lot: x.lot || guess.lot || '', supplier: x.supplier || guess.supplier || '',
      }))
      if (guess.origin) setMeat((m) => ({ ...m, origin: m.origin || guess.origin }))
      setOcr({ text })
    } catch (e) { setOcr({ err: 'Lecture impossible (Internet requis au premier usage). Saisissez à la main.' }) }
  }

  return (
    <Page title="Ajouter un produit" back="/produits">
      {!write && <ReadOnlyNote />}
      <PhotoPicker label="1. Photo de l’étiquette" required ids={photos} onChange={setPhotos} onAdded={setLast} />
      {last && <button type="button" className="btn secondary block" disabled={ocr.busy} onClick={runOcr}>{ocr.busy ? 'Lecture en cours…' : '🔍 Lire l’étiquette (OCR)'}</button>}
      {ocr.err && <p style={{ color: 'var(--red)' }}>{ocr.err}</p>}
      {ocr.text !== undefined && <p className="note">Champs pré-remplis : vérifiez et corrigez avant de valider.</p>}

      <h2>2. Informations</h2>
      <Field label="Nom du produit"><input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <div className="row">
        <Field label="Type de date"><select value={f.dlcType} onChange={(e) => set('dlcType', e.target.value)}><option>DLC</option><option>DDM</option></select></Field>
        <Field label="Date"><input type="date" value={f.dlc} onChange={(e) => set('dlc', e.target.value)} /></Field>
      </div>
      <Field label="Numéro de lot"><input value={f.lot} onChange={(e) => set('lot', e.target.value)} /></Field>
      <Field label="Fournisseur (facultatif)"><input value={f.supplier} onChange={(e) => set('supplier', e.target.value)} /></Field>
      <Field label="Provenance / pays d’origine"><input value={f.country} onChange={(e) => set('country', e.target.value)} /></Field>
      <Field label="Nombre de poches ouvertes"><input type="number" min={1} value={f.pouches} onChange={(e) => set('pouches', Number(e.target.value))} /></Field>

      <h2>3. Catégorie</h2>
      <div className="tabs">
        {(Object.keys(PROD_CAT_LABEL) as ProdCat[]).map((c) => (
          <button key={c} type="button" className={`tab ${f.category === c ? 'on' : ''}`} onClick={() => set('category', c)}>{PROD_CAT_LABEL[c]}</button>
        ))}
      </div>
      <label className="row" style={{ margin: '14px 0' }}>
        <input type="checkbox" checked={f.isMeat} onChange={(e) => set('isMeat', e.target.checked)} /> <b>Viande</b> (origine réglementaire, distincte du fournisseur)
      </label>
      {f.isMeat && (['born', 'raised', 'slaughtered', 'cut', 'origin'] as const).map((k) => (
        <Field key={k} label={{ born: 'Pays de naissance (si applicable)', raised: 'Pays d’élevage', slaughtered: 'Pays d’abattage', cut: 'Pays de découpe (si applicable)', origin: 'Pays d’origine (si mention applicable)' }[k]}>
          <input value={meat[k] ?? ''} onChange={(e) => setMeat({ ...meat, [k]: e.target.value })} />
        </Field>
      ))}
      <p className="note">Date, heure et agent ({user.name}) enregistrés automatiquement.</p>
      <button className="btn block" disabled={!ok} onClick={async () => {
        await create(db.products, 'produit', {
          name: f.name.trim(), category: f.category, dlcType: f.dlcType, dlc: f.dlc || undefined, lot: f.lot.trim(), supplier: f.supplier.trim() || undefined,
          country: f.country.trim() || undefined, isMeat: f.isMeat, meat: f.isMeat ? meat : undefined, pouches: f.pouches, photoIds: photos,
          userId: user.id, userName: user.name, openedAt: Date.now(), ocrText: ocr.text,
        }, `${f.name} lot ${f.lot}`)
        nav('/produits')
      }}>✔ Enregistrer</button>
      {photos.length === 0 && <p className="note">Photo de l’étiquette obligatoire.</p>}
    </Page>
  )
}
