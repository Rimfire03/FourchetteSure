import Fastify from 'fastify'
import cors from '@fastify/cors'
import { randomUUID } from 'node:crypto'
import { hashPassword, verifyPassword, newToken, hashToken, makeLimiter } from './auth.js'

export const TABLES = new Set([
  'users', 'reminders', 'taskLogs', 'products', 'deliveries', 'cleaningItems', 'cleaningLogs', 'openRefs', 'opened', 'audit', 'regs', 'settings',
])
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function buildApp(pool, { registerCode } = {}) {
  const app = Fastify({ bodyLimit: 12 * 1024 * 1024, trustProxy: true })
  app.register(cors, { origin: true, allowedHeaders: ['Authorization', 'Content-Type'], methods: ['GET', 'POST', 'PUT', 'OPTIONS'] })
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream']) {
    app.addContentTypeParser(type, { parseAs: 'buffer' }, (_req, body, done) => done(null, body))
  }
  const loginLimit = makeLimiter(10, 15 * 60_000)
  const registerLimit = makeLimiter(5, 60 * 60_000)

  app.get('/health', async () => ({ ok: true }))

  app.post('/auth/register', async (req, reply) => {
    if (!registerLimit(req.ip)) return reply.code(429).send({ error: 'Trop de tentatives' })
    const { email, password, etabName, code } = req.body ?? {}
    if (!registerCode || code !== registerCode) return reply.code(403).send({ error: 'Code d’inscription invalide' })
    const mail = String(email ?? '').trim().toLowerCase()
    if (!EMAIL.test(mail)) return reply.code(400).send({ error: 'E-mail invalide' })
    if (String(password ?? '').length < 8) return reply.code(400).send({ error: 'Mot de passe : 8 caractères minimum' })
    const etabId = randomUUID()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('INSERT INTO etabs (id, name, created_at) VALUES ($1,$2,$3)', [etabId, String(etabName || 'Ma cantine').slice(0, 100), Date.now()])
      await client.query('INSERT INTO accounts (email, pass_hash, etab_id, created_at) VALUES ($1,$2,$3,$4)', [mail, await hashPassword(password), etabId, Date.now()])
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      if (e.code === '23505') return reply.code(409).send({ error: 'Compte déjà existant' })
      throw e
    } finally { client.release() }
    return session(pool, mail, etabId, String(etabName || 'Ma cantine'))
  })

  app.post('/auth/login', async (req, reply) => {
    const { email, password } = req.body ?? {}
    const mail = String(email ?? '').trim().toLowerCase()
    if (!loginLimit(req.ip + mail)) return reply.code(429).send({ error: 'Trop de tentatives, réessayez plus tard' })
    const r = await pool.query('SELECT a.pass_hash, a.etab_id, e.name FROM accounts a JOIN etabs e ON e.id = a.etab_id WHERE a.email = $1', [mail])
    const row = r.rows[0]
    if (!row || !(await verifyPassword(String(password ?? ''), row.pass_hash))) return reply.code(401).send({ error: 'E-mail ou mot de passe incorrect' })
    return session(pool, mail, row.etab_id, row.name)
  })

  app.register(async (priv) => {
    priv.addHook('preHandler', async (req, reply) => {
      const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
      const r = m && await pool.query(
        'SELECT a.etab_id FROM sessions s JOIN accounts a ON a.email = s.email WHERE s.token_hash = $1', [hashToken(m[1])])
      if (!r || !r.rowCount) return reply.code(401).send({ error: 'Non authentifié' })
      req.etabId = r.rows[0].etab_id
    })

    priv.get('/sync/pull', async (req) => {
      const since = Number(req.query.since) || 0
      const limit = Math.min(Number(req.query.limit) || 500, 1000)
      const r = await pool.query(
        'SELECT tbl, id, data, deleted, seq FROM docs WHERE etab_id = $1 AND seq > $2 ORDER BY seq LIMIT $3', [req.etabId, since, limit + 1])
      const more = r.rows.length > limit
      const rows = r.rows.slice(0, limit)
      return { docs: rows.map((x) => ({ tbl: x.tbl, id: x.id, data: x.data, deleted: x.deleted })), seq: rows.length ? Number(rows[rows.length - 1].seq) : since, more }
    })

    // Dernier écrit gagne (champ `updated`), un document plus ancien ne remplace jamais un plus récent.
    priv.post('/sync/push', async (req, reply) => {
      const docs = req.body?.docs
      if (!Array.isArray(docs) || docs.length > 500) return reply.code(400).send({ error: 'docs invalide' })
      let applied = 0
      for (const d of docs) {
        if (!TABLES.has(d.tbl) || typeof d.id !== 'string' || !d.id) return reply.code(400).send({ error: `document refusé: ${d.tbl}` })
        const r = await pool.query(
          `INSERT INTO docs (etab_id, tbl, id, data, updated, deleted) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (etab_id, tbl, id) DO UPDATE SET data = EXCLUDED.data, updated = EXCLUDED.updated, deleted = EXCLUDED.deleted,
             seq = nextval(pg_get_serial_sequence('docs','seq'))
           WHERE docs.updated <= EXCLUDED.updated`,
          [req.etabId, d.tbl, d.id, d.deleted ? null : JSON.stringify(d.data ?? {}), Number(d.updated) || Date.now(), !!d.deleted])
        applied += r.rowCount
      }
      return { applied }
    })

    priv.put('/photos/:id', async (req, reply) => {
      const buf = req.body
      if (!Buffer.isBuffer(buf) || !buf.length) return reply.code(400).send({ error: 'photo vide' })
      await pool.query(
        'INSERT INTO photos (etab_id, id, mime, bytes, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (etab_id, id) DO NOTHING',
        [req.etabId, req.params.id, req.headers['content-type'] ?? 'image/jpeg', buf, Date.now()])
      return { ok: true }
    })

    priv.get('/photos/:id', async (req, reply) => {
      const r = await pool.query('SELECT mime, bytes FROM photos WHERE etab_id = $1 AND id = $2', [req.etabId, req.params.id])
      if (!r.rowCount) return reply.code(404).send({ error: 'introuvable' })
      return reply.header('Content-Type', r.rows[0].mime).send(r.rows[0].bytes)
    })

    priv.post('/photos/missing', async (req) => {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 500) : []
      const r = await pool.query('SELECT id FROM photos WHERE etab_id = $1 AND id = ANY($2)', [req.etabId, ids])
      const have = new Set(r.rows.map((x) => x.id))
      return { missing: ids.filter((i) => !have.has(i)) }
    })
  })

  return app
}

async function session(pool, email, etabId, etabName) {
  const token = newToken()
  await pool.query('INSERT INTO sessions (token_hash, email, created_at) VALUES ($1,$2,$3)', [hashToken(token), email, Date.now()])
  return { token, etabId, etabName }
}
