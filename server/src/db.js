import pg from 'pg'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS etabs (id text PRIMARY KEY, name text NOT NULL, created_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS accounts (
  email text PRIMARY KEY, pass_hash text NOT NULL, etab_id text NOT NULL REFERENCES etabs(id), created_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, email text NOT NULL, created_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS docs (
  etab_id text NOT NULL, tbl text NOT NULL, id text NOT NULL, data jsonb, updated bigint NOT NULL,
  deleted boolean NOT NULL DEFAULT false, seq bigserial,
  PRIMARY KEY (etab_id, tbl, id));
CREATE INDEX IF NOT EXISTS docs_seq ON docs (etab_id, seq);
CREATE TABLE IF NOT EXISTS photos (
  etab_id text NOT NULL, id text NOT NULL, mime text NOT NULL, bytes bytea NOT NULL, created_at bigint NOT NULL,
  PRIMARY KEY (etab_id, id));
`

/** Connexion au serveur Postgres partagé ; la base applicative dbName est créée si absente, puis le schéma appliqué. */
export async function openPool({ host, port, user, password, dbName, ssl = true }) {
  // Le Postgres Dokploy impose TLS avec un certificat auto-signé : réseau interne Docker, pas de vérification de chaîne.
  const base = { host, port, user, password, ssl: ssl ? { rejectUnauthorized: false } : false }
  const admin = new pg.Client({ ...base, database: "postgres" })
  await admin.connect()
  try {
    const r = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName])
    if (!r.rowCount) await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, "")}"`)
  } finally { await admin.end() }
  const pool = new pg.Pool({ ...base, database: dbName, max: 10 })
  await pool.query(SCHEMA)
  return pool
}
