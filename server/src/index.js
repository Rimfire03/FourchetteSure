import { buildApp } from './app.js'
import { openPool } from './db.js'

const { DATABASE_URL, DB_NAME = 'fourchette', REGISTER_CODE, PORT = 3000 } = process.env
if (!DATABASE_URL) { console.error('DATABASE_URL manquant'); process.exit(1) }
if (!REGISTER_CODE) console.warn('REGISTER_CODE absent : inscriptions désactivées')

const pool = await openPool({ url: DATABASE_URL, dbName: DB_NAME })
const app = buildApp(pool, { registerCode: REGISTER_CODE })
await app.listen({ port: Number(PORT), host: '0.0.0.0' })
