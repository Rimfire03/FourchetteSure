import { useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, ROLE_LABEL, type Role, type User } from './lib/db'
import { getUser, restoreUser, setUser, sha256 } from './lib/session'
import { seedIfEmpty } from './lib/seed'
import { create, logAudit } from './lib/store'
import { checkReminders } from './lib/notify'
import { Field, UpdateDialog, UserCtx } from './ui'
import { checkUpdate, isSkipped, type UpdateInfo } from './lib/update'
import Home from './pages/Home'
import Reminders, { ReminderTask } from './pages/Reminders'
import Products, { ProductForm } from './pages/Products'
import Receptions, { ReceptionForm } from './pages/Receptions'
import Cleaning from './pages/Cleaning'
import OpenDates from './pages/OpenDates'
import Regulation from './pages/Regulation'
import Admin from './pages/Admin'
import Export from './pages/Export'
import ServerPanel from './pages/ServerPanel'

function Setup({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [etab, setEtab] = useState('Ma cantine')
  const [srv, setSrv] = useState(false)
  return (
    <div className="login">
      <h1>Bienvenue</h1>
      <p className="note">Créez le compte administrateur et nommez votre établissement.</p>
      <Field label="Nom de l’établissement"><input value={etab} onChange={(e) => setEtab(e.target.value)} /></Field>
      <Field label="Votre nom"><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></Field>
      <Field label="Code PIN (4 chiffres minimum)"><input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" type="password" /></Field>
      <button className="btn block" disabled={!name.trim() || pin.length < 4} onClick={async () => {
        await db.settings.put({ key: 'etabName', value: etab.trim() })
        const u = await create(db.users, 'utilisateur', { name: name.trim(), role: 'admin', pinHash: await sha256(pin), active: true }, 'admin initial')
        setUser(u); onDone()
      }}>Créer et commencer</button>
      <p className="note" style={{ textAlign: 'center', marginTop: 18 }}>Déjà un compte serveur (autre appareil) ?</p>
      <button className="btn secondary block" onClick={() => setSrv(!srv)}>Se connecter au serveur</button>
      {srv && <ServerPanel loginOnly />}
    </div>
  )
}

function Login({ users, onDone }: { users: User[]; onDone: () => void }) {
  const [id, setId] = useState(users[0]?.id ?? '')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  return (
    <div className="login">
      <h1>Qui êtes-vous ?</h1>
      <Field label="Utilisateur">
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({ROLE_LABEL[u.role as Role]})</option>)}
        </select>
      </Field>
      <Field label="Code PIN"><input value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setErr('') }} inputMode="numeric" type="password" /></Field>
      {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
      <button className="btn block" disabled={!pin} onClick={async () => {
        const u = users.find((x) => x.id === id)
        if (u && u.pinHash === (await sha256(pin))) { setUser(u); await logAudit('session', u.id, 'connexion'); onDone() }
        else setErr('PIN incorrect')
      }}>Entrer</button>
    </div>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [user, setU] = useState<User | null>(null)
  const users = useLiveQuery(() => db.users.filter((u) => u.active).toArray(), [], [] as User[])
  const [due, setDue] = useState<string[]>([])
  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  useEffect(() => { (async () => { await seedIfEmpty(); setU(await restoreUser()); setReady(true) })() }, [])
  useEffect(() => {
    if (!user) return
    const run = async () => setDue(await checkReminders(user.id, user.role))
    void run()
    const t = setInterval(run, 30_000)
    return () => clearInterval(t)
  }, [user])

  useEffect(() => {
    if (!user) return
    void checkUpdate().then((u) => u && !isSkipped(u.version) && setUpdate(u))
  }, [user?.id])

  if (!ready) return null
  if (!users.length && !user) return <Setup onDone={() => setU(restoreUserSync())} />
  if (!user) return <Login users={users} onDone={() => setU(restoreUserSync())} />

  return (
    <UserCtx.Provider value={{ user, logout: () => { setUser(null); setU(null) } }}>
      {update && <UpdateDialog info={update} onClose={() => setUpdate(null)} />}
      <DueBanner ids={due} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/rappels" element={<Reminders />} />
        <Route path="/rappels/:id" element={<ReminderTask />} />
        <Route path="/produits" element={<Products />} />
        <Route path="/produits/nouveau" element={<ProductForm />} />
        <Route path="/reception" element={<Receptions />} />
        <Route path="/reception/nouvelle" element={<ReceptionForm />} />
        <Route path="/nettoyage" element={<Cleaning />} />
        <Route path="/dlc" element={<OpenDates />} />
        <Route path="/reglementation" element={<Regulation />} />
        <Route path="/export" element={<Export />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </UserCtx.Provider>
  )
}

const restoreUserSync = () => getUser()

function DueBanner({ ids }: { ids: string[] }) {
  const items = useLiveQuery(() => db.reminders.bulkGet(ids), [ids.join(',')], [])
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '8px 16px 0' }}>
      {items.filter(Boolean).map((r) => (
        <div key={r!.id} className="alarm" role="alert">
          <span>⏰ {r!.title} à valider</span>
          <Link to={`/rappels/${r!.id}`}>Ouvrir</Link>
        </div>
      ))}
    </div>
  )
}

