import { isNewer } from './logic'

export const REPO = 'Rimfire03/FourchetteSure'
export const APP_VERSION = __APP_VERSION__
export interface UpdateInfo { version: string; notes: string; apkUrl: string; page: string }

/** Cherche la dernière release GitHub ; null si à jour, hors-ligne ou erreur. */
export async function checkUpdate(): Promise<UpdateInfo | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const j = await r.json() as { tag_name: string; body?: string; html_url: string; assets?: { name: string; browser_download_url: string }[] }
    const version = String(j.tag_name).replace(/^v/, '')
    if (!isNewer(version, APP_VERSION)) return null
    const apk = j.assets?.find((a) => a.name.toLowerCase().endsWith('.apk'))
    return { version, notes: j.body ?? '', apkUrl: apk?.browser_download_url ?? j.html_url, page: j.html_url }
  } catch { return null }
}

const SKIP = 'skipVersion'
export const isSkipped = (v: string) => { try { return localStorage.getItem(SKIP) === v } catch { return false } }
export const skipVersion = (v: string) => { try { localStorage.setItem(SKIP, v) } catch { /* ignore */ } }
