import sanitizeHtml from 'sanitize-html';
import { query, tx } from '../db/pool.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../services/billing.js';

// Isi poin berasal dari editor teks kaya (TinyMCE) dan dibaca semua pemilik rumah: selalu disanitasi di server.
const CLEAN = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'ul', 'ol', 'li', 'a', 'h3', 'h4', 'blockquote', 'span'],
  allowedAttributes: { a: ['href', 'target', 'rel'], span: ['style'] },
  allowedStyles: { span: { 'text-decoration': [/^(underline|line-through)$/] } },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
};
const clean = (html) => sanitizeHtml(html || '', CLEAN).trim();

const body = {
  type: 'object',
  required: ['title', 'meeting_date', 'points'],
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 200 },
    meeting_date: { type: 'string', format: 'date' },
    location: { type: 'string', maxLength: 200 },
    points: {
      type: 'array', minItems: 1, maxItems: 50,
      items: { type: 'object', required: ['title'], properties: { title: { type: 'string', minLength: 1, maxLength: 255 }, content: { type: 'string', maxLength: 50000 } } },
    },
  },
};

async function savePoints(db, noteId, points) {
  await db.query('DELETE FROM meeting_note_points WHERE note_id=$1', [noteId]);
  for (const [i, p] of points.entries()) {
    await db.query('INSERT INTO meeting_note_points (note_id,sort_no,title,content) VALUES ($1,$2,$3,$4)',
      [noteId, i + 1, p.title.trim(), clean(p.content)]);
  }
}

async function loadNote(id) {
  const note = (await query('SELECT * FROM meeting_notes WHERE id=$1', [id])).rows[0];
  if (!note) throw new HttpError(404, 'Notulen tidak ditemukan');
  const points = (await query('SELECT id,sort_no,title,content FROM meeting_note_points WHERE note_id=$1 ORDER BY sort_no', [id])).rows;
  return { ...note, points };
}

export default async function (app) {
  const manage = app.auth('pengurus'); // administrator otomatis boleh
  const admin = app.auth('administrator');

  // Dibaca semua pengguna yang sudah login (termasuk pemilik rumah)
  app.get('/notes', { preHandler: app.auth() }, async () => {
    const { rows } = await query(
      `SELECT n.id, n.title, n.meeting_date, n.location, COUNT(p.id) AS point_count
       FROM meeting_notes n LEFT JOIN meeting_note_points p ON p.note_id=n.id
       GROUP BY n.id ORDER BY n.meeting_date DESC, n.id DESC`);
    const titles = (await query('SELECT note_id, title FROM meeting_note_points ORDER BY note_id, sort_no')).rows;
    return rows.map((n) => ({ ...n, point_titles: titles.filter((t) => t.note_id === n.id).slice(0, 3).map((t) => t.title) }));
  });

  app.get('/notes/:id', { preHandler: app.auth() }, async (req) => loadNote(Number(req.params.id)));

  app.post('/notes', { preHandler: manage, schema: { body } }, async (req, reply) => {
    const b = req.body;
    const id = await tx(async (db) => {
      const { rows } = await db.query(
        'INSERT INTO meeting_notes (title,meeting_date,location,created_by) VALUES ($1,$2,$3,$4) RETURNING id',
        [b.title.trim(), b.meeting_date, (b.location || '').trim(), req.user.id]);
      await savePoints(db, rows[0].id, b.points);
      await audit(req, 'tambah', 'meeting_note', rows[0].id, null, { title: b.title, meeting_date: b.meeting_date, poin: b.points.length }, db);
      return rows[0].id;
    });
    return reply.code(201).send(await loadNote(id));
  });

  app.put('/notes/:id', { preHandler: manage, schema: { body } }, async (req) => {
    const id = Number(req.params.id);
    const b = req.body;
    const before = await loadNote(id);
    await tx(async (db) => {
      await db.query('UPDATE meeting_notes SET title=$2, meeting_date=$3, location=$4, updated_by=$5, updated_at=now() WHERE id=$1',
        [id, b.title.trim(), b.meeting_date, (b.location || '').trim(), req.user.id]);
      await savePoints(db, id, b.points);
      await audit(req, 'ubah', 'meeting_note', id,
        { title: before.title, meeting_date: before.meeting_date, poin: before.points.length },
        { title: b.title, meeting_date: b.meeting_date, poin: b.points.length }, db);
    });
    return loadNote(id);
  });

  app.delete('/notes/:id', { preHandler: admin }, async (req) => {
    const id = Number(req.params.id);
    const before = await loadNote(id);
    await query('DELETE FROM meeting_notes WHERE id=$1', [id]);
    await audit(req, 'hapus', 'meeting_note', id, { title: before.title, meeting_date: before.meeting_date, poin: before.points.length }, null);
    return { ok: true };
  });
}
