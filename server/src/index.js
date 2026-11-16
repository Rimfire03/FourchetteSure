import { buildApp } from "./app.js"
import { openPool } from "./db.js"

const e = process.env
for (const k of ["DB_HOST", "DB_USER", "DB_PASSWORD"]) if (!e[k]) { console.error(k + " manquant"); process.exit(1) }
if (!e.REGISTER_CODE) console.warn("REGISTER_CODE absent : inscriptions désactivées")

const pool = await openPool({
  host: e.DB_HOST, port: Number(e.DB_PORT || 5432), user: e.DB_USER, password: e.DB_PASSWORD,
  dbName: e.DB_NAME || "fourchette", ssl: e.DB_SSL !== "false",
})
const app = buildApp(pool, { registerCode: e.REGISTER_CODE })
await app.listen({ port: Number(e.PORT || 3000), host: "0.0.0.0" })
