import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { frDateTime } from '../lib/logic'
import { connect, DEFAULT_API_URL, disconnect, getCfg, GOOGLE_CLIENT_ID, googleIdToken, syncNow, useSyncStatus, type SyncState } from '../lib/sync'
import { Card, Field } from '../ui'

export const STATE_TXT: Record<SyncState, string> = {
  off: 'Mode local (non connecté)', idle: 'Synchronisé', syncing: 'Synchronisation…', offline: 'Hors ligne : les données restent sur l’appareil',
  auth: 'Reconnexion nécessaire', error: 'Erreur de synchronisation',
}

export function usePending() {
  return useLiveQuery(async () => (await db.outbox.count()) + (await db.photoQueue.count()), [], 0)
}

export function SyncBadge() {
  const s = useSyncStatus()
  const pending = usePending()
  if (s.state === 'off') return null
  return <p className="note" style={{ textAlign: 'center' }}>☁ {STATE_TXT[s.state]}{pending ? ` · ${pending} en attente` : ''}</p>
}

export default function ServerPanel({ loginOnly = false }: { loginOnly?: boolean }) {
  const cfg = useLiveQuery(getCfg, [], undefined)
  const s = useSyncStatus()
  const pending = usePending()
  const [f, setF] = useState({ url: DEFAULT_API_URL, email: '', password: '', mode: 'login' as 'login' | 'register' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v })

  if (cfg) {
    return (
      <Card>
        <h3>Serveur</h3>
        <p>Compte : <b>{cfg.email}</b><br />{STATE_TXT[s.state]}{s.last ? ` (${frDateTime(s.last)})` : ''}{pending ? ` · ${pending} élément(s) en attente d’envoi` : ''}</p>
        {s.state === 'error' && <p style={{ color: 'var(--red)' }}>{s.error}</p>}
        <div className="row">
          <button className="btn small" onClick={() => void syncNow()}>Synchroniser maintenant</button>
          <button className="btn secondary small" onClick={() => { if (confirm('Se déconnecter du serveur ? Les données restent sur cet appareil.')) void disconnect() }}>Se déconnecter</button>
        </div>
        {s.state === 'auth' && <p className="note">Session expirée : déconnectez-vous puis reconnectez-vous.</p>}
      </Card>
    )
  }

  return (
    <Card>
      <h3>Connecter au serveur</h3>
      <p className="note">Sans serveur, l’appli fonctionne seule sur cet appareil. Connectée, elle synchronise vos données entre appareils et continue de fonctionner sans réseau.</p>
      {!loginOnly && (
        <div className="tabs">
          <button className={`tab ${f.mode === 'login' ? 'on' : ''}`} onClick={() => set('mode', 'login')}>J’ai un compte</button>
          <button className={`tab ${f.mode === 'register' ? 'on' : ''}`} onClick={() => set('mode', 'register')}>Créer un compte</button>
        </div>
      )}
      <Field label="Adresse du serveur"><input value={f.url} onChange={(e) => set('url', e.target.value)} autoCapitalize="off" /></Field>
      <Field label="E-mail"><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoCapitalize="off" /></Field>
      <Field label="Mot de passe" hint={f.mode === 'register' ? '8 caractères minimum' : undefined}><input type="password" value={f.password} onChange={(e) => set('password', e.target.value)} /></Field>
      {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
      {GOOGLE_CLIENT_ID && (
        <button className="btn secondary block" style={{ marginBottom: 10 }} disabled={busy} onClick={async () => {
          setBusy(true); setErr('')
          try {
            const idToken = await googleIdToken()
            await connect({ url: f.url, email: '', password: '', mode: 'google', idToken, confirmReplace: () => confirm('Le serveur contient déjà des données. Les données de cet appareil seront remplacées par celles du serveur. Continuer ?') })
            location.reload()
          } catch (e) { setErr(e instanceof TypeError ? 'Serveur injoignable : vérifiez la connexion.' : (e as Error).message) }
          finally { setBusy(false) }
        }}>Continuer avec Google</button>
      )}
      <button className="btn block" disabled={busy || !f.email || !f.password} onClick={async () => {
        setBusy(true); setErr('')
        try {
          await connect({ url: f.url, email: f.email, password: f.password, mode: f.mode, confirmReplace: () => confirm('Le serveur contient déjà des données. Les données de cet appareil seront remplacées par celles du serveur. Continuer ?') })
          location.reload()
        } catch (e) { setErr(e instanceof TypeError ? 'Serveur injoignable : vérifiez la connexion.' : (e as Error).message) }
        finally { setBusy(false) }
      }}>{f.mode === 'register' ? 'Créer le compte et envoyer mes données' : 'Se connecter'}</button>
    </Card>
  )
}
