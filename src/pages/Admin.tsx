import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, ROLE_LABEL, type CleaningItem, type OpenRef, type Reminder, type Role, type User } from '../lib/db'
import { FREQ_LABEL, frDateTime, ymd, type Frequency } from '../lib/logic'
import { sha256 } from '../lib/session'
import { create, update } from '../lib/store'
import { checkUpdate, APP_VERSION, type UpdateInfo } from '../lib/update'
import { Card, Field, Page, UpdateDialog, useAuth, useCan } from '../ui'

type Tab = 'rappels' | 'nettoyage' | 'produits' | 'users' | 'etab' | 'audit'
const DAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

export default function Admin() {
  const isAdmin = useCan('users')
  const configure = useCan('configure')
  const [tab, setTab] = useState<Tab>('rappels')
  if (!configure) return <Page title="Paramètres"><p>Accès réservé.</p></Page>
  const tabs: [Tab, string][] = [['rappels', 'Rappels'], ['nettoyage', 'Plan nettoyage'], ['produits', 'Produits ouverts'], ...(isAdmin ? [['users', 'Utilisateurs'] as [Tab, string]] : []), ['etab', 'Établissement & sauvegarde'], ['audit', 'Journal']]
  return (
    <Page title="Paramètres">
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'rappels' && <RemindersAdmin />}
      {tab === 'nettoyage' && <CleaningAdmin />}
      {tab === 'produits' && <RefsAdmin />}
      {tab === 'users' && isAdmin && <UsersAdmin />}
      {tab === 'etab' && <EtabAdmin />}
      {tab === 'audit' && <AuditView />}
    </Page>
  )
}

function RemindersAdmin() {
  const rs = useLiveQuery(() => db.reminders.toArray(), [], [] as Reminder[])
  const agents = useLiveQuery(() => db.users.filter((u) => u.active && u.role !== 'viewer').toArray(), [], [] as User[])
  const up = (id: string, p: Partial<Reminder>) => update(db.reminders, 'rappel', id, p)
  return (
    <>
      {rs.sort((a, b) => a.time.localeCompare(b.time)).map((r) => (
        <Card key={r.id} tone={r.enabled ? 'green' : ''}>
          <div className="row sb"><b>{r.title}</b>
            <label className="row"><input type="checkbox" checked={r.enabled} onChange={(e) => up(r.id, { enabled: e.target.checked })} /> Actif</label></div>
          <div className="row">
            <Field label="Heure"><input type="time" value={r.time} onChange={(e) => up(r.id, { time: e.target.value })} /></Field>
            <label className="row"><input type="checkbox" checked={r.photoRequired} onChange={(e) => up(r.id, { photoRequired: e.target.checked })} /> Photo obligatoire</label>
          </div>
          <div className="row">{DAYS.map((d, i) => (
            <button key={i} className={`tab ${r.days.includes(i) ? 'on' : ''}`} onClick={() => up(r.id, { days: r.days.includes(i) ? r.days.filter((x) => x !== i) : [...r.days, i] })}>{d}</button>))}</div>
          <Field label="Affecter à (vide = tous)">
            <select multiple value={r.assignedTo} onChange={(e) => up(r.id, { assignedTo: [...e.target.selectedOptions].map((o) => o.value) })}>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        </Card>
      ))}
      <button className="btn secondary" onClick={() => { const t = prompt('Titre du nouveau rappel ?'); if (t) void create(db.reminders, 'rappel', { key: 'custom-' + Date.now(), title: t, time: '10:00', days: [1, 2, 3, 4, 5], kind: 'generic', photoRequired: false, enabled: true, assignedTo: [] }) }}>+ Nouveau rappel</button>
    </>
  )
}

function CleaningAdmin() {
  const items = useLiveQuery(() => db.cleaningItems.toArray(), [], [] as CleaningItem[])
  const up = (id: string, p: Partial<CleaningItem>) => update(db.cleaningItems, 'plan nettoyage', id, p)
  return (
    <>
      <p className="note">Fréquences = propositions de départ, à adapter à vos locaux. Une zone désactivée disparaît du planning mais reste dans l’historique.</p>
      {items.map((i) => (
        <Card key={i.id}>
          <div className="row sb"><b>{i.zone}</b><label className="row"><input type="checkbox" checked={i.active} onChange={(e) => up(i.id, { active: e.target.checked })} /> Actif</label></div>
          <div className="row">
            <Field label="Fréquence"><select value={i.frequency} onChange={(e) => up(i.id, { frequency: e.target.value as Frequency })}>
              {(Object.keys(FREQ_LABEL) as Frequency[]).map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}</select></Field>
            {i.frequency === 'custom' && <Field label="Tous les (jours)"><input type="number" min={1} value={i.customDays ?? 1} onChange={(e) => up(i.id, { customDays: Number(e.target.value) })} /></Field>}
          </div>
          <label className="row"><input type="checkbox" checked={i.photoRequired} onChange={(e) => up(i.id, { photoRequired: e.target.checked })} /> Photo obligatoire</label>
          <div className="row">
            <Field label="Produit"><input defaultValue={i.product} onBlur={(e) => up(i.id, { product: e.target.value })} /></Field>
            <Field label="Dilution"><input defaultValue={i.dilution} onBlur={(e) => up(i.id, { dilution: e.target.value })} /></Field>
            <Field label="Contact (min)"><input defaultValue={i.contactMin} onBlur={(e) => up(i.id, { contactMin: e.target.value })} /></Field>
          </div>
        </Card>
      ))}
      <button className="btn secondary" onClick={() => { const z = prompt('Zone ou équipement ?'); if (z) void create(db.cleaningItems, 'plan nettoyage', { zone: z, frequency: 'daily', photoRequired: false, rinse: true, active: true, createdYmd: ymd(new Date()) }) }}>+ Nouvelle zone</button>
    </>
  )
}

function RefsAdmin() {
  const refs = useLiveQuery(() => db.openRefs.orderBy('name').toArray(), [], [] as OpenRef[])
  const up = (id: string, p: Partial<OpenRef>) => update(db.openRefs, 'fiche produit', id, p)
  return (
    <>
      <p className="note">Durées à renseigner d’après l’étiquette du fabricant ou une procédure HACCP validée. Ne pas appliquer une durée à toute une famille.</p>
      {refs.map((r) => (
        <Card key={r.id}>
          <b>{r.family} · {r.name}</b>
          <div className="row">
            <Field label="Durée après ouverture (jours)"><input type="number" min={1} defaultValue={r.days} onBlur={(e) => up(r.id, { days: e.target.value ? Number(e.target.value) : undefined })} /></Field>
            <Field label="Température de conservation"><input defaultValue={r.tempC} onBlur={(e) => up(r.id, { tempC: e.target.value })} /></Field>
          </div>
          <Field label="Conditions particulières"><input defaultValue={r.conditions} onBlur={(e) => up(r.id, { conditions: e.target.value })} /></Field>
          <Field label="Source de la durée"><select defaultValue={r.source} onChange={(e) => up(r.id, { source: e.target.value })}>
            {['Étiquette fabricant', 'Fiche technique', 'Procédure HACCP validée', r.source].filter((v, i, a): v is string => !!v && a.indexOf(v) === i).map((s) => <option key={s}>{s}</option>)}</select></Field>
        </Card>
      ))}
      <button className="btn secondary" onClick={() => { const n = prompt('Nom du produit ?'); if (n) void create(db.openRefs, 'fiche produit', { name: n, family: prompt('Famille ?') || 'Divers' }) }}>+ Nouveau produit</button>
    </>
  )
}

function UsersAdmin() {
  const { user: me } = useAuth()
  const users = useLiveQuery(() => db.users.toArray(), [], [] as User[])
  const [f, setF] = useState({ name: '', role: 'agent' as Role, pin: '' })
  return (
    <>
      {users.map((u) => (
        <Card key={u.id}>
          <div className="row sb"><b>{u.name}</b>
            <select value={u.role} disabled={u.id === me.id} onChange={(e) => update(db.users, 'utilisateur', u.id, { role: e.target.value as Role })}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
          <div className="row">
            <button className="btn secondary small" onClick={async () => { const p = prompt('Nouveau PIN (4 chiffres min.)'); if (p && /^\d{4,}$/.test(p)) await update(db.users, 'utilisateur', u.id, { pinHash: await sha256(p) }) }}>Changer le PIN</button>
            {u.id !== me.id && <button className="btn secondary small" onClick={() => update(db.users, 'utilisateur', u.id, { active: !u.active })}>{u.active ? 'Désactiver' : 'Réactiver'}</button>}
          </div>
        </Card>
      ))}
      <Card>
        <h3>Nouvel utilisateur</h3>
        <Field label="Nom"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Profil"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
        <Field label="PIN (4 chiffres min.)"><input type="password" inputMode="numeric" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} /></Field>
        <button className="btn" disabled={!f.name.trim() || f.pin.length < 4} onClick={async () => {
          await create(db.users, 'utilisateur', { name: f.name.trim(), role: f.role, pinHash: await sha256(f.pin), active: true }, f.name)
          setF({ name: '', role: 'agent', pin: '' })
        }}>Ajouter</button>
      </Card>
    </>
  )
}

function EtabAdmin() {
  const name = useLiveQuery(async () => (await db.settings.get('etabName'))?.value as string, [], '')
  const [msg, setMsg] = useState('')
  const [upd, setUpd] = useState<UpdateInfo | null>(null)
  return (
    <>
      {upd && <UpdateDialog info={upd} onClose={() => setUpd(null)} />}
      <h3>Version {APP_VERSION}</h3>
      <button className="btn secondary" onClick={async () => { const u = await checkUpdate(); setUpd(u); setMsg(u ? '' : 'Application à jour (ou hors connexion).') }}>Vérifier les mises à jour</button>
      <Field label="Nom de l’établissement"><input defaultValue={name} key={name} onBlur={(e) => db.settings.put({ key: 'etabName', value: e.target.value })} /></Field>
      <h3>Sauvegarde</h3>
      <p className="note">Les données sont stockées sur cet appareil. Faites une sauvegarde régulière (fichier avec photos).</p>
      <button className="btn" onClick={async () => setMsg(await exportBackup())}>Télécharger la sauvegarde</button>
      <Field label="Restaurer une sauvegarde"><input type="file" accept="application/json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setMsg(await importBackup(f)) }} /></Field>
      {msg && <p className="note">{msg}</p>}
    </>
  )
}

const TABLES = ['users', 'reminders', 'taskLogs', 'products', 'deliveries', 'cleaningItems', 'cleaningLogs', 'openRefs', 'opened', 'audit', 'regs', 'settings'] as const
async function exportBackup() {
  const out: Record<string, unknown> = { version: 1, at: Date.now() }
  for (const t of TABLES) out[t] = await db.table(t).toArray()
  out.photos = await Promise.all((await db.photos.toArray()).map(async (p) => ({
    id: p.id, createdAt: p.createdAt,
    data: await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(p.blob) }),
  })))
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }))
  a.download = `sauvegarde-cuisine-${ymd(new Date())}.json`
  a.click()
  return 'Sauvegarde téléchargée.'
}
async function importBackup(file: File) {
  try {
    const d = JSON.parse(await file.text())
    if (d.version !== 1) return 'Fichier non reconnu.'
    for (const t of TABLES) if (Array.isArray(d[t])) await db.table(t).bulkPut(d[t])
    for (const p of d.photos ?? []) await db.photos.put({ id: p.id, createdAt: p.createdAt, blob: await (await fetch(p.data)).blob() })
    return 'Sauvegarde restaurée (fusion avec les données existantes).'
  } catch { return 'Échec de la restauration.' }
}

function AuditView() {
  const rows = useLiveQuery(() => db.audit.orderBy('at').reverse().limit(200).toArray(), [], [])
  return (
    <>
      <p className="note">Journal des 200 dernières actions (création, modification, connexion).</p>
      <table><tbody>{rows.map((a) => (
        <tr key={a.id}><td>{frDateTime(a.at)}</td><td>{a.userName}</td><td>{a.entity} · {a.action}</td><td className="note">{a.detail.slice(0, 80)}</td></tr>))}</tbody></table>
    </>
  )
}
