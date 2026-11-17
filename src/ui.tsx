import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { db, type User } from './lib/db'
import { can } from './lib/session'
import { savePhoto } from './lib/store'

export const UserCtx = createContext<{ user: User; logout: () => void } | null>(null)
export const useAuth = () => useContext(UserCtx)!
export const useCan = (a: 'write' | 'configure' | 'users') => can(useAuth().user.role, a)

export function Page({ title, children, back = '/', actions }: { title: string; children: ReactNode; back?: string | null; actions?: ReactNode }) {
  return (
    <main className="page">
      <header className="bar">
        {back && <Link to={back} className="back" aria-label="Retour">‹</Link>}
        <h1>{title}</h1>
        <div className="grow" />
        {actions}
      </header>
      {children}
    </main>
  )
}

export const Card = ({ children, tone, onClick }: { children: ReactNode; tone?: string; onClick?: () => void }) => (
  <section className={`card ${tone ?? ''}`} onClick={onClick}>{children}</section>
)

export const Badge = ({ tone, children }: { tone: 'green' | 'orange' | 'red' | 'grey'; children: ReactNode }) => (
  <span className={`badge ${tone}`}>{children}</span>
)

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function Thumbs({ ids, onRemove }: { ids: string[]; onRemove?: (id: string) => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let dead = false
    const made: string[] = []
    ;(async () => {
      const out: Record<string, string> = {}
      for (const id of ids) {
        const p = await db.photos.get(id)
        if (p) { const u = URL.createObjectURL(p.blob); made.push(u); out[id] = u }
      }
      if (!dead) setUrls(out)
    })()
    return () => { dead = true; made.forEach(URL.revokeObjectURL) }
  }, [ids.join(',')])
  if (!ids.length) return null
  return (
    <div className="thumbs">
      {ids.map((id) => (
        <div key={id} className="thumb">
          {urls[id] ? <a href={urls[id]} target="_blank" rel="noreferrer"><img src={urls[id]} alt="Photo" /></a> : <div className="ph" />}
          {onRemove && <button type="button" className="x" onClick={() => onRemove(id)} aria-label="Retirer la photo">×</button>}
        </div>
      ))}
    </div>
  )
}

export function PhotoPicker({ label, ids, onChange, required, onAdded }: {
  label: string; ids: string[]; onChange: (ids: string[]) => void; required?: boolean; onAdded?: (b: Blob) => void
}) {
  return (
    <div className="field">
      <span>{label}{required && <b className="req"> *</b>}</span>
      <label className="btn secondary photo-btn">
        📷 Prendre une photo
        <input
          type="file" accept="image/*" capture="environment" multiple hidden
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])]
            const added: string[] = []
            for (const f of files) { added.push(await savePhoto(f)); onAdded?.(f) }
            onChange([...ids, ...added])
            e.target.value = ''
          }}
        />
      </label>
      <Thumbs ids={ids} onRemove={(id) => onChange(ids.filter((x) => x !== id))} />
    </div>
  )
}

export function useTick(ms = 30_000) {
  const [n, setN] = useState(0)
  useEffect(() => { const t = setInterval(() => setN((x) => x + 1), ms); return () => clearInterval(t) }, [ms])
  return n
}

export const ReadOnlyNote = () => <p className="note">Profil en lecture seule : saisie impossible.</p>

