import { db } from './db'
import { expiryState, frDate, pad, ymd } from './logic'

const lastFired = new Map<string, number>()
const REPEAT_MS = 5 * 60_000 // notification persistante : rappel toutes les 5 min tant que non validée

export const notifSupported = () => 'Notification' in window
export const askNotifPermission = async () => (notifSupported() ? Notification.requestPermission() : 'denied')

export function beep() {
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator()
    o.frequency.value = 880
    o.connect(ctx.destination)
    o.start()
    setTimeout(() => { o.stop(); ctx.close() }, 400)
  } catch { /* audio blocked until user gesture */ }
}

async function show(title: string, body: string, tag: string) {
  beep()
  if (!notifSupported() || Notification.permission !== 'granted') return
  const reg = await navigator.serviceWorker?.getRegistration()
  const opts = { body, tag, requireInteraction: true, icon: '/icon.svg' } as NotificationOptions
  if (reg) reg.showNotification(title, opts)
  else new Notification(title, opts)
}

/** Appelé périodiquement : renvoie les rappels dus et non validés, et notifie. */
export async function checkReminders(userId?: string, userRole?: string): Promise<string[]> {
  const now = new Date()
  const today = ymd(now)
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const [list, logs] = await Promise.all([db.reminders.toArray(), db.taskLogs.where('date').equals(today).toArray()])
  const due: string[] = []
  for (const r of list) {
    if (!r.enabled || !r.days.includes(now.getDay()) || hm < r.time) continue
    if (r.assignedTo.length && userId && !r.assignedTo.includes(userId) && userRole === 'agent') continue
    if (logs.some((l) => l.reminderId === r.id)) continue
    due.push(r.id)
    const last = lastFired.get(r.id) ?? 0
    if (Date.now() - last >= REPEAT_MS) {
      lastFired.set(r.id, Date.now())
      void show(r.title, 'Tâche à valider dans l’application.', 'reminder-' + r.id)
    }
  }
  // Dates après ouverture : jour d'ouverture, veille, jour J, dépassement (une fois par état et par jour).
  for (const o of await db.opened.where('status').equals('open').toArray()) {
    const st = expiryState(o.dueYmd, today)
    const label = o.openedYmd === today ? `ouvert aujourd’hui, limite ${frDate(o.dueYmd)}` : st === 'eve' ? 'à consommer avant demain' : st === 'today' ? 'date limite aujourd’hui' : st === 'expired' ? 'date limite dépassée' : ''
    const key = `open-${o.id}-${label}-${today}`
    if (label && !lastFired.has(key)) { lastFired.set(key, Date.now()); void show(o.name, label, key) }
  }
  return due
}
