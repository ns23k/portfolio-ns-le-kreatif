require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { query, getPool } = require('./db');
const auth = require('./auth');
const mailer = require('./mailer');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ---------- constantes ---------- */
const CATS = {
  affiche: 'Affiche évènement',
  logo: 'Logo',
  carte: 'Carte de visite',
  brochure: 'Brochure',
  mockup: 'Mockup présentation',
  sport: 'Design sport',
};
const STATUSES = ['nouveau', 'en_cours', 'devis_envoye', 'accepte', 'refuse', 'termine', 'archive'];
const PROJECT_TYPES = ['Affiche', 'Logo', 'Carte de visite', 'Brochure', 'Design sport', 'Identité visuelle', 'Photographie', 'Autre'];
const MAX_IMAGE = 3.5 * 1024 * 1024;
const MIME_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/* ---------- utilitaires ---------- */
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const intOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.round(Number(String(v).replace(/[\s .]/g, '').replace(',', '.')));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `NK-${s}`;
}

// limiteur très simple en mémoire (par IP)
const hits = new Map();
function rateLimit(key, limit, windowMs) {
  return (req, res, next) => {
    const id = `${key}:${req.ip}`;
    const now = Date.now();
    const entry = hits.get(id) || { n: 0, t: now };
    if (now - entry.t > windowMs) { entry.n = 0; entry.t = now; }
    entry.n++;
    hits.set(id, entry);
    if (entry.n > limit) return res.status(429).json({ error: 'Trop de tentatives, réessaie dans quelques minutes.' });
    next();
  };
}

function publicWork(w) {
  return {
    id: w.id, title: w.title, cat: w.cat, catLabel: w.cat_label, description: w.description,
    src: w.image_url, featured: !!w.featured,
  };
}
function adminWork(w) {
  return { ...publicWork(w), published: !!w.published, position: w.position, mediaId: w.media_id, createdAt: w.created_at, updatedAt: w.updated_at };
}
function quoteOut(q) {
  return {
    id: q.id, code: q.code, name: q.name, email: q.email, phone: q.phone, projectType: q.project_type,
    budget: q.budget, deadline: q.deadline, message: q.message, status: q.status, price: q.price,
    unread: !!q.unread_admin, createdAt: q.created_at, updatedAt: q.updated_at,
  };
}
const msgOut = (m) => ({ id: m.id, author: m.author, body: m.body, price: m.price, createdAt: m.created_at });

/* ---------- parsers + base prête ---------- */
app.use('/api', express.json({ limit: '200kb' }));
const { schemaReady } = require('./schema');
app.use('/api', (req, res, next) => {
  if (req.path === '/admin/logout') return next();
  schemaReady().then(() => next(), next);
});

/* ============================================================
   API PUBLIQUE
============================================================ */
app.get('/api/health', wrap(async (req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, mail: mailer.enabled() });
}));

app.get('/api/works', wrap(async (req, res) => {
  const rows = await query('SELECT * FROM works WHERE published = 1 ORDER BY position ASC, id ASC');
  // navigateur : toujours revalider (les modifs admin apparaissent tout de suite) ; CDN : 10 s max
  res.set('Cache-Control', 'public, no-cache, s-maxage=10, stale-while-revalidate=60');
  res.json({ works: rows.map(publicWork), categories: CATS });
}));

app.get('/api/media/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).end();
  const rows = await query('SELECT mime, data FROM media WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).end();
  res.set('Content-Type', rows[0].mime);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(rows[0].data);
}));

app.post('/api/quotes', rateLimit('quote', 6, 10 * 60 * 1000), wrap(async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true, code: makeCode() }); // pot de miel anti-robots
  const data = {
    name: str(b.name, 120), email: str(b.email, 190).toLowerCase(), phone: str(b.phone, 40) || null,
    project_type: str(b.projectType, 60), budget: str(b.budget, 60) || null, deadline: str(b.deadline, 60) || null,
    message: str(b.message, 5000),
  };
  const errors = {};
  if (data.name.length < 2) errors.name = 'Veuillez indiquer votre nom.';
  if (!isEmail(data.email)) errors.email = 'Adresse email invalide.';
  if (data.phone && !/^[\d+\s().-]{7,20}$/.test(data.phone)) errors.phone = 'Numéro invalide.';
  if (!data.project_type) errors.projectType = 'Merci de choisir un type de projet.';
  if (data.message.length < 10) errors.message = 'Merci de décrire votre projet (10 caractères min).';
  if (Object.keys(errors).length) return res.status(422).json({ error: 'Formulaire incomplet.', fields: errors });

  let code, result;
  for (let i = 0; i < 5; i++) {
    code = makeCode();
    try {
      result = await query(
        'INSERT INTO quotes (code, name, email, phone, project_type, budget, deadline, message) VALUES (?,?,?,?,?,?,?,?)',
        [code, data.name, data.email, data.phone, data.project_type, data.budget, data.deadline, data.message]);
      break;
    } catch (e) { if (e.code !== 'ER_DUP_ENTRY') throw e; }
  }
  const q = { id: result.insertId, code, ...data };
  const mail = await mailer.notifyNewQuote(q);
  res.status(201).json({ ok: true, code, emailSent: mail.client });
}));

async function findTracked(code, email) {
  const c = str(code, 16).toUpperCase();
  const e = str(email, 190).toLowerCase();
  if (!c || !e) return null;
  const rows = await query('SELECT * FROM quotes WHERE code = ? AND email = ?', [c, e]);
  return rows[0] || null;
}

app.post('/api/track', rateLimit('track', 30, 10 * 60 * 1000), wrap(async (req, res) => {
  const q = await findTracked(req.body?.code, req.body?.email);
  if (!q) return res.status(404).json({ error: 'Aucune demande trouvée avec ce code et cet email.' });
  const msgs = await query('SELECT * FROM quote_messages WHERE quote_id = ? ORDER BY created_at ASC, id ASC', [q.id]);
  const out = quoteOut(q);
  delete out.unread;
  res.json({ quote: out, messages: msgs.map(msgOut) });
}));

app.post('/api/track/reply', rateLimit('trackreply', 10, 10 * 60 * 1000), wrap(async (req, res) => {
  const q = await findTracked(req.body?.code, req.body?.email);
  if (!q) return res.status(404).json({ error: 'Demande introuvable.' });
  const action = ['accept', 'refuse'].includes(req.body?.action) ? req.body.action : null;
  let body = str(req.body?.body, 3000);
  if (!body && !action) return res.status(422).json({ error: 'Le message est vide.' });
  if (action && !['devis_envoye', 'en_cours', 'refuse', 'accepte'].includes(q.status)) {
    return res.status(409).json({ error: 'Cette demande ne peut plus être acceptée ou refusée.' });
  }
  if (action && !q.price) return res.status(409).json({ error: "Aucun montant n'a encore été proposé." });
  if (action === 'accept') body = `✅ Devis accepté${body ? ' — ' + body : ''}`;
  if (action === 'refuse') body = `❌ Devis refusé${body ? ' — ' + body : ''}`;
  await query('INSERT INTO quote_messages (quote_id, author, body) VALUES (?, "client", ?)', [q.id, body]);
  const newStatus = action === 'accept' ? 'accepte' : action === 'refuse' ? 'refuse' : q.status;
  await query('UPDATE quotes SET unread_admin = 1, status = ? WHERE id = ?', [newStatus, q.id]);
  mailer.notifyClientMessage(q, body, action);
  res.json({ ok: true, status: newStatus });
}));

/* ============================================================
   ADMIN — session
============================================================ */
// seuls les échecs comptent : 8 erreurs → blocage 15 min pour cette IP
app.post('/api/admin/login', (req, res) => {
  const { user, password } = req.body || {};
  if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: "ADMIN_PASSWORD n'est pas configuré sur le serveur." });
  const key = `loginfail:${req.ip}`, now = Date.now();
  const fails = hits.get(key);
  if (fails && now - fails.t < 15 * 60 * 1000 && fails.n >= 8) {
    return res.status(429).json({ error: 'Trop de tentatives, réessaie dans 15 minutes.' });
  }
  if (!auth.checkCredentials(str(user, 100), String(password ?? ''))) {
    const e = fails && now - fails.t < 15 * 60 * 1000 ? fails : { n: 0, t: now };
    e.n++; hits.set(key, e);
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
  }
  hits.delete(key);
  auth.setSessionCookie(req, res, auth.createToken(str(user, 100)));
  res.json({ ok: true, user: str(user, 100) });
});

app.post('/api/admin/logout', (req, res) => { auth.clearSessionCookie(res); res.json({ ok: true }); });

app.get('/api/admin/me', (req, res) => {
  const s = auth.verifyToken(auth.readCookie(req, auth.COOKIE));
  if (!s) return res.status(401).json({ error: 'Non connecté' });
  res.json({ user: s.u, mail: mailer.enabled(), categories: CATS, statuses: STATUSES, projectTypes: PROJECT_TYPES });
});

const admin = express.Router();
admin.use(auth.requireAdmin);

/* ---------- tableau de bord ---------- */
admin.get('/stats', wrap(async (req, res) => {
  const [w] = await query('SELECT COUNT(*) AS total, SUM(published) AS published, SUM(featured) AS featured FROM works');
  const byCat = await query('SELECT cat, COUNT(*) AS n FROM works GROUP BY cat');
  const byStatus = await query('SELECT status, COUNT(*) AS n FROM quotes GROUP BY status');
  const [u] = await query('SELECT COUNT(*) AS n FROM quotes WHERE unread_admin = 1');
  const [acc] = await query("SELECT COALESCE(SUM(price),0) AS total FROM quotes WHERE status IN ('accepte','termine')");
  const recent = await query('SELECT * FROM quotes ORDER BY created_at DESC LIMIT 5');
  res.json({
    works: { total: Number(w.total), published: Number(w.published || 0), featured: Number(w.featured || 0), byCat },
    quotes: { unread: Number(u.n), byStatus, acceptedTotal: Number(acc.total), recent: recent.map(quoteOut) },
  });
}));

/* ---------- médias ---------- */
admin.post('/media', express.raw({ type: MIME_OK, limit: MAX_IMAGE }), wrap(async (req, res) => {
  const mime = (req.headers['content-type'] || '').split(';')[0];
  if (!MIME_OK.includes(mime) || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(415).json({ error: 'Format non accepté (JPG, PNG, WEBP ou GIF).' });
  }
  const r = await query('INSERT INTO media (mime, bytes, data) VALUES (?,?,?)', [mime, req.body.length, req.body]);
  res.status(201).json({ id: r.insertId, url: `/api/media/${r.insertId}` });
}));

/* ---------- créations ---------- */
function readWork(b, partial = false) {
  const out = {}; const errors = {};
  if (!partial || 'title' in b) { out.title = str(b.title, 200); if (out.title.length < 2) errors.title = 'Titre requis.'; }
  if (!partial || 'cat' in b) { out.cat = str(b.cat, 30); if (!CATS[out.cat]) errors.cat = 'Catégorie inconnue.'; }
  if (!partial || 'catLabel' in b) { out.cat_label = str(b.catLabel, 100) || CATS[out.cat || b.cat] || ''; }
  if (!partial || 'description' in b) out.description = str(b.description, 2000) || null;
  if (!partial || 'src' in b) {
    out.image_url = str(b.src, 500);
    if (!/^(\/images\/|\/api\/media\/\d+$|https:\/\/)/.test(out.image_url)) errors.src = 'Image requise.';
    const m = out.image_url.match(/^\/api\/media\/(\d+)$/);
    out.media_id = m ? Number(m[1]) : null;
  }
  if ('featured' in b) out.featured = b.featured ? 1 : 0;
  if ('published' in b) out.published = b.published ? 1 : 0;
  return { data: out, errors };
}

async function cleanupMedia(mediaId) {
  if (!mediaId) return;
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM works WHERE media_id = ?', [mediaId]);
  if (Number(n) === 0) await query('DELETE FROM media WHERE id = ?', [mediaId]);
}

admin.get('/works', wrap(async (req, res) => {
  const rows = await query('SELECT * FROM works ORDER BY position ASC, id ASC');
  res.json({ works: rows.map(adminWork) });
}));

admin.post('/works', wrap(async (req, res) => {
  const { data, errors } = readWork(req.body || {});
  if (Object.keys(errors).length) return res.status(422).json({ error: 'Champs invalides.', fields: errors });
  const [{ p }] = await query('SELECT COALESCE(MIN(position), 10) AS p FROM works');
  data.position = req.body.position === 'end'
    ? (await query('SELECT COALESCE(MAX(position), 0) + 10 AS p FROM works'))[0].p
    : Number(p) - 10; // nouvelle créa en tête par défaut
  if (data.featured === undefined) data.featured = 0;
  if (data.published === undefined) data.published = 1;
  const r = await query('INSERT INTO works SET ?', [data]);
  const [w] = await query('SELECT * FROM works WHERE id = ?', [r.insertId]);
  res.status(201).json({ work: adminWork(w) });
}));

admin.put('/works/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [before] = await query('SELECT * FROM works WHERE id = ?', [id]);
  if (!before) return res.status(404).json({ error: 'Création introuvable.' });
  const { data, errors } = readWork(req.body || {}, true);
  if (Object.keys(errors).length) return res.status(422).json({ error: 'Champs invalides.', fields: errors });
  if (Object.keys(data).length) await query('UPDATE works SET ? WHERE id = ?', [data, id]);
  if ('image_url' in data && before.media_id && before.media_id !== data.media_id) await cleanupMedia(before.media_id);
  const [w] = await query('SELECT * FROM works WHERE id = ?', [id]);
  res.json({ work: adminWork(w) });
}));

admin.delete('/works/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [w] = await query('SELECT * FROM works WHERE id = ?', [id]);
  if (!w) return res.status(404).json({ error: 'Création introuvable.' });
  await query('DELETE FROM works WHERE id = ?', [id]);
  await cleanupMedia(w.media_id);
  res.json({ ok: true });
}));

admin.post('/works/reorder', wrap(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  if (!ids.length) return res.status(422).json({ error: 'Liste vide.' });
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    for (let i = 0; i < ids.length; i++) await conn.query('UPDATE works SET position = ? WHERE id = ?', [(i + 1) * 10, ids[i]]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  res.json({ ok: true });
}));

/* ---------- devis ---------- */
admin.get('/quotes', wrap(async (req, res) => {
  const where = []; const params = [];
  const status = str(req.query.status, 20);
  if (status === 'actifs') where.push("status NOT IN ('archive','termine','refuse')");
  else if (STATUSES.includes(status)) { where.push('status = ?'); params.push(status); }
  const s = str(req.query.q, 100);
  if (s) { where.push('(name LIKE ? OR email LIKE ? OR code LIKE ? OR message LIKE ? OR phone LIKE ?)'); params.push(...Array(5).fill(`%${s}%`)); }
  const rows = await query(
    `SELECT q.*, (SELECT COUNT(*) FROM quote_messages m WHERE m.quote_id = q.id) AS msg_count
     FROM quotes q ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY q.unread_admin DESC, q.updated_at DESC LIMIT 300`, params);
  res.json({ quotes: rows.map((r) => ({ ...quoteOut(r), messageCount: Number(r.msg_count) })) });
}));

admin.get('/quotes/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [q] = await query('SELECT * FROM quotes WHERE id = ?', [id]);
  if (!q) return res.status(404).json({ error: 'Demande introuvable.' });
  if (q.unread_admin) {
    await query('UPDATE quotes SET unread_admin = 0, updated_at = updated_at WHERE id = ?', [id]);
    if (q.status === 'nouveau') await query("UPDATE quotes SET status = 'en_cours' WHERE id = ?", [id]), (q.status = 'en_cours');
    q.unread_admin = 0;
  }
  const msgs = await query('SELECT * FROM quote_messages WHERE quote_id = ? ORDER BY created_at ASC, id ASC', [id]);
  res.json({ quote: quoteOut(q), messages: msgs.map(msgOut), trackUrl: `/suivi.html?code=${q.code}` });
}));

admin.post('/quotes/:id/reply', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [q] = await query('SELECT * FROM quotes WHERE id = ?', [id]);
  if (!q) return res.status(404).json({ error: 'Demande introuvable.' });
  const body = str(req.body?.body, 5000);
  const price = intOrNull(req.body?.price);
  if (body.length < 2) return res.status(422).json({ error: 'Écris une réponse.', fields: { body: 'Message requis.' } });
  if (Number.isNaN(price)) return res.status(422).json({ error: 'Montant invalide.', fields: { price: 'Montant invalide.' } });
  let status = STATUSES.includes(req.body?.status) ? req.body.status : (price ? 'devis_envoye' : q.status === 'nouveau' ? 'en_cours' : q.status);
  await query('INSERT INTO quote_messages (quote_id, author, body, price) VALUES (?, "admin", ?, ?)', [id, body, price]);
  await query('UPDATE quotes SET status = ?, price = COALESCE(?, price), unread_admin = 0 WHERE id = ?', [status, price, id]);
  const emailSent = req.body?.sendEmail === false ? false : await mailer.notifyReply(q, body, price);
  res.json({ ok: true, emailSent, status });
}));

admin.patch('/quotes/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const sets = {};
  if (req.body?.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) return res.status(422).json({ error: 'Statut inconnu.' });
    sets.status = req.body.status;
  }
  if (req.body?.price !== undefined) {
    const p = intOrNull(req.body.price);
    if (Number.isNaN(p)) return res.status(422).json({ error: 'Montant invalide.' });
    sets.price = p;
  }
  if (req.body?.unread !== undefined) sets.unread_admin = req.body.unread ? 1 : 0;
  if (!Object.keys(sets).length) return res.status(422).json({ error: 'Rien à modifier.' });
  const r = await query('UPDATE quotes SET ? WHERE id = ?', [sets, id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Demande introuvable.' });
  res.json({ ok: true });
}));

admin.delete('/quotes/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  await query('DELETE FROM quote_messages WHERE quote_id = ?', [id]);
  const r = await query('DELETE FROM quotes WHERE id = ?', [id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Demande introuvable.' });
  res.json({ ok: true });
}));

app.use('/api/admin', admin);

app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue.' }));

/* ---------- fichiers statiques (en local / Render ; Vercel les sert lui-même) ---------- */
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: '1h' }));

/* ---------- erreurs ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Fichier trop lourd (3,5 Mo max).' });
  console.error(err);
  const dbDown = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ER_ACCESS_DENIED_ERROR', 'PROTOCOL_CONNECTION_LOST'].includes(err.code);
  res.status(500).json({ error: dbDown ? 'Base de données injoignable pour le moment.' : 'Erreur serveur, réessaie.' });
});

module.exports = app;
