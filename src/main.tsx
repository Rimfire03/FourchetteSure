import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import * as sync from './lib/sync'
import { startSync } from './lib/sync'
import { db } from './lib/db'
import * as store from './lib/store'
import './styles.css'

registerSW({ immediate: true })
void startSync()
// Débogage / tests e2e en développement uniquement (supprimé du build de production).
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__app = { db, sync, store }
createRoot(document.getElementById('root')!).render(
  <StrictMode><HashRouter><App /></HashRouter></StrictMode>,
)
