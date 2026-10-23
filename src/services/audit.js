import { query } from '../db/pool.js';

export async function audit(req, action, entity, entityId, before, after, db = { query }) {
  const u = req.user || {};
  await db.query(
    `INSERT INTO audit_logs (user_id,username,action,entity,entity_id,before,after,ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [u.id ?? null, u.username ?? null, action, entity, entityId == null ? null : String(entityId),
     before ?? null, after ?? null, req.ip]
  );
}
