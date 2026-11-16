import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { cleaningStatus, expiryState, frDate, frDateTime, pad, reminderState, ymd } from '../lib/logic'
import { APP_VERSION } from '../lib/update'
import { askNotifPermission, notifSupported } from '../lib/notify'
import { Badge, Card, Page, useAuth, useCan, useTick } from '../ui'

const TILES = [
  ['/rappels', '⏰', 'Rappels journaliers'], ['/produits', '🏷️', 'Traçabilité produits'], ['/reception', '🚚', 'Contrôle réception'],
  ['/nettoyage', '🧽', 'Plan de nettoyage'], ['/dlc', '📅', 'Dates après ouverture'], ['/reglementation', '📖', 'Réglementation'],
]
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export default function Home() {
  const { user, logout } = useAuth()
  const admin = useCan('configure')
  useTick()
  const now = new Date()
  const today = ymd(now)
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const etab = useLiveQuery(async () => (await db.settings.get('etabName'))?.value as string, [], '')

  const data = useLiveQuery(async () => {
    const [reminders, rlogs, items, clogs, opened, deliveries] = await Promise.all([
      db.reminders.toArray(), db.taskLogs.where('date').equals(today).toArray(), db.cleaningItems.filter((i) => i.active).toArray(),
      db.cleaningLogs.toArray(), db.opened.where('status').equals('open').toArray(), db.deliveries.orderBy('createdAt').reverse().limit(3).toArray(),
    ])
    let done = 0, total = 0, late = 0
    for (const r of reminders.filter((x) => x.enabled && x.days.includes(now.getDay()))) {
      total++
      const st = reminderState(r.time, rlogs.some((l) => l.reminderId === r.id), hm)
      if (st === 'done') done++; else if (st === 'late') late++
    }
    for (const it of items) {
      const mine = clogs.filter((l) => l.itemId === it.id).map((l) => l.date).sort()
      const { light } = cleaningStatus(it, mine[mine.length - 1], today)
      const doneToday = mine.includes(today)
      if (light !== 'green' || doneToday) total++
      if (doneToday) done++
      else if (light === 'red') late++
    }
    const soon = opened.filter((o) => expiryState(o.dueYmd, today) !== 'ok').sort((a, b) => a.dueYmd.localeCompare(b.dueYmd))
    return { done, total, late, soon, deliveries }
  }, [today, hm], null)

  const quickAlarm = data && data.late > 0
  return (
    <Page title={etab || 'Tableau de bord'} back={null} actions={<button className="btn secondary small" onClick={logout}>{user.name} ⏻</button>}>
      <Card>
        <b style={{ textTransform: 'capitalize' }}>{DAYS[now.getDay()]}</b> {now.getDate()} {MONTHS[now.getMonth()]}
      </Card>
      <div className="kpis">
        <div className="kpi green"><b>{data?.done ?? 0}</b>Terminées</div>
        <div className="kpi orange"><b>{data ? data.total - data.done : 0}</b>À effectuer</div>
        <div className="kpi red"><b>{data?.late ?? 0}</b>En retard</div>
      </div>
      {quickAlarm && <Card tone="red"><b>{data!.late} tâche(s) en retard.</b> <Link to="/rappels">Voir les rappels</Link></Card>}
      {notifSupported() && Notification.permission === 'default' && (
        <Card><p className="note">Activez les notifications pour recevoir les rappels.</p>
          <button className="btn secondary small" onClick={() => askNotifPermission().then(() => location.reload())}>Activer les notifications</button></Card>
      )}
      <h2>Accès rapide</h2>
      <div className="grid">
        {TILES.map(([to, ic, t]) => <Link key={to} to={to} className="tile"><span className="ic">{ic}</span>{t}</Link>)}
      </div>
      <h2>Produits à surveiller</h2>
      {data?.soon.length ? data.soon.map((o) => {
        const s = expiryState(o.dueYmd, today)
        return (
          <Card key={o.id} tone={s === 'expired' ? 'red' : 'orange'}>
            <div className="row sb"><b>{o.name}</b>
              <Badge tone={s === 'expired' ? 'red' : 'orange'}>{s === 'expired' ? 'Dépassé' : s === 'today' ? 'Aujourd’hui' : 'Demain'}</Badge></div>
            <span className="note">Limite : {frDate(o.dueYmd)} · {o.quantity}</span>
          </Card>
        )
      }) : <p className="note">Rien à signaler.</p>}
      <h2>Dernières livraisons</h2>
      {data?.deliveries.length ? data.deliveries.map((d) => (
        <Card key={d.id}><div className="row sb"><b>{d.supplier}</b>
          <Badge tone={d.anomaly ? 'red' : 'green'}>{d.anomaly ? 'Anomalie' : 'Conforme'}</Badge></div>
          <span className="note">{frDateTime(d.createdAt)} · BL {d.bl}</span></Card>
      )) : <p className="note">Aucune livraison enregistrée.</p>}
      <div className="row" style={{ marginTop: 18 }}>
        <Link to="/export" className="btn">📄 Exporter mon dossier sanitaire</Link>
        {admin && <Link to="/admin" className="btn secondary">⚙️ Paramètres</Link>}
      </div>
      <p className="note" style={{ marginTop: 24, textAlign: 'center' }}>FourchetteSûre v{APP_VERSION}</p>
    </Page>
  )
}
