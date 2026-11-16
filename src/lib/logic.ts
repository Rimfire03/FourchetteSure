// Pure business logic (no DB / DOM) so it can be unit-tested.

export const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (s: string, n: number) => {
  const d = parseYmd(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
export const diffDays = (a: string, b: string) =>
  Math.round((parseYmd(a).getTime() - parseYmd(b).getTime()) / 86_400_000)
export const frDate = (s?: string) => (s ? s.split('-').reverse().join('/') : '')
export const frDateTime = (ms: number) => {
  const d = new Date(ms)
  return `${frDate(ymd(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Arrêté 21/12/2009 annexe IV: plats témoins gardés >= 5 jours après le dernier repas servi. */
export const SAMPLE_KEEP_DAYS = 5
export const sampleDisposeDate = (servedYmd: string) => addDays(servedYmd, SAMPLE_KEEP_DAYS)

export type Frequency = 'multi' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semester' | 'yearly' | 'custom'
export const FREQ_LABEL: Record<Frequency, string> = {
  multi: 'Plusieurs fois par jour',
  daily: 'Tous les jours',
  weekly: 'Chaque semaine',
  monthly: 'Tous les mois',
  quarterly: 'Tous les trimestres',
  semester: 'Tous les semestres',
  yearly: 'Une fois par an',
  custom: 'Personnalisée',
}
export const freqDays = (f: Frequency, custom = 1): number =>
  ({ multi: 1, daily: 1, weekly: 7, monthly: 30, quarterly: 91, semester: 182, yearly: 365, custom: Math.max(1, custom) })[f]

export type Light = 'green' | 'orange' | 'red'
/** Vert: fait pour la période. Orange: à faire aujourd'hui. Rouge: en retard. */
export function cleaningStatus(
  item: { frequency: Frequency; customDays?: number; createdYmd: string },
  lastDoneYmd: string | undefined,
  today: string,
): { light: Light; nextDue: string } {
  const nextDue = addDays(lastDoneYmd ?? item.createdYmd, lastDoneYmd ? freqDays(item.frequency, item.customDays) : 0)
  const d = diffDays(nextDue, today)
  return { nextDue, light: d > 0 ? 'green' : d === 0 ? 'orange' : 'red' }
}

export type ExpiryState = 'ok' | 'eve' | 'today' | 'expired'
export function expiryState(dueYmd: string, today: string): ExpiryState {
  const d = diffDays(dueYmd, today)
  return d < 0 ? 'expired' : d === 0 ? 'today' : d === 1 ? 'eve' : 'ok'
}

export function reminderState(time: string, done: boolean, nowHm: string): 'done' | 'late' | 'pending' {
  return done ? 'done' : nowHm >= time ? 'late' : 'pending'
}

export interface LabelGuess { name?: string; dlc?: string; lot?: string; storage?: string; origin?: string; supplier?: string }
const toIso = (d: string, m: string, y: string) => `${y.length === 2 ? '20' + y : y}-${m}-${d}`
/** Best-effort OCR text -> fields. Human verifies before saving. */
export function parseLabel(text: string): LabelGuess {
  const t = text.replace(/\r/g, '')
  const out: LabelGuess = {}
  const dm = t.match(/(?:DLC|DDM|DLUO|consommer(?:\s+de\s+pr[ée]f[ée]rence)?\s+(?:jusqu['’]au|avant(?:\s+le)?|le)|\bà\s+consommer)[^\d\n]{0,25}(\d{2})[\/.\- ](\d{2})[\/.\- ](\d{2,4})/i)
  if (dm) out.dlc = toIso(dm[1], dm[2], dm[3])
  const lm = t.match(/(?:\bLOT\b|\bL\s?[:.]|N°\s*(?:de\s*)?lot)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/.]{2,})/i)
  if (lm) out.lot = lm[1]
  const sm = t.match(/(?:à\s+conserver|conservation)[^\n]{0,80}/i)
  if (sm) out.storage = sm[0].trim()
  const om = t.match(/(?:origine|né\s+en|élevé\s+en|abattu\s+en)\s*[:\-]?\s*([A-Za-zÀ-ÿ' -]{2,30})/i)
  if (om) out.origin = om[1].trim()
  const fm = t.match(/(?:fabriqu[ée]\s+par|produit\s+par|distribu[ée]\s+par|fournisseur)\s*[:\-]?\s*([^\n]{3,40})/i)
  if (fm) out.supplier = fm[1].trim()
  const line = t.split('\n').map((l) => l.trim()).find((l) => /[A-Za-zÀ-ÿ]{4,}/.test(l) && !/\d{2}[\/.]\d{2}/.test(l))
  if (line) out.name = line.slice(0, 60)
  return out
}

/** true si la version `a` (x.y.z) est strictement plus récente que `b`. */
export function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}
