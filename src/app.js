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
  charte: 'Charte graphique',
  sport: 'Design sport',
  web: 'Site web',
};
const STATUSES = ['nouveau', 'en_cours', 'devis_envoye', 'accepte', 'refuse', 'termine', 'archive'];
const PROJECT_TYPES = ['Affiche', 'Logo', 'Carte de visite', 'Brochure', 'Design sport', 'Identité visuelle', 'Charte graphique', 'Site web', 'Photographie', 'Autre'];
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

function pagesOf(w) {
  try { const a = JSON.parse(w.pages || '[]'); if (Array.isArray(a) && a.length) return a; } catch {}
  return [w.image_url];
}
const SRC_RE = /^(\/images\/|\/api\/media\/\d+$|https:\/\/)/;
const mediaIdOf = (src) => { const m = String(src || '').match(/^\/api\/media\/(\d+)$/); return m ? Number(m[1]) : null; };
function publicWork(w) {
  return {
    pages: pagesOf(w),
    id: w.id, title: w.title, cat: w.cat, catLabel: w.cat_label, description: w.description,
    src: w.image_url, featured: !!w.featured,
    link: w.link_url || null,
    tags: w.tags ? String(w.tags).split(',').map((t) => t.trim()).filter(Boolean) : [],
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

// Options « Option N — Nom : 20 000 FCFA » lues dans la dernière proposition de l'admin
function parseOptions(text) {
  const out = [];
  const re = /^Option\s+(\d+)\s*[—–-]\s*(.+?)\s*:\s*([\d\s\u00a0\u202f.]+)\s*F\s?CFA/gim;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const price = Number(m[3].replace(/[^\d]/g, ''));
    if (price > 0) out.push({ n: Number(m[1]), name: m[2].trim().slice(0, 120), price });
  }
  return out;
}
async function lastOptions(quoteId) {
  const rows = await query('SELECT body FROM quote_messages WHERE quote_id = ? AND author = "admin" ORDER BY created_at DESC, id DESC LIMIT 1', [quoteId]);
  return rows[0] ? parseOptions(rows[0].body) : [];
}

app.post('/api/track', rateLimit('track', 30, 10 * 60 * 1000), wrap(async (req, res) => {
  const q = await findTracked(req.body?.code, req.body?.email);
  if (!q) return res.status(404).json({ error: 'Aucune demande trouvée avec ce code et cet email.' });
  const msgs = await query('SELECT * FROM quote_messages WHERE quote_id = ? ORDER BY created_at ASC, id ASC', [q.id]);
  const out = quoteOut(q);
  delete out.unread;
  const lastAdmin = [...msgs].reverse().find((m) => m.author === 'admin');
  out.options = lastAdmin ? parseOptions(lastAdmin.body) : [];
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
  let chosen = null;
  if (action === 'accept' && req.body?.option != null) {
    const opts = await lastOptions(q.id);
    chosen = opts.find((o) => o.n === Number(req.body.option)) || null;
    if (opts.length && !chosen) return res.status(422).json({ error: 'Option inconnue.' });
  }
  if (chosen) {
    await query('UPDATE quotes SET price = ? WHERE id = ?', [chosen.price, q.id]);
    body = `Option ${chosen.n} — ${chosen.name} (${chosen.price.toLocaleString('fr-FR')} FCFA)${body ? ' — ' + body : ''}`;
  }
  if (action === 'accept') body = `✅ Devis accepté${body ? ' — ' + body : ''}`;
  if (action === 'refuse') body = `❌ Devis refusé${body ? ' — ' + body : ''}`;
  await query('INSERT INTO quote_messages (quote_id, author, body) VALUES (?, "client", ?)', [q.id, body]);
  const newStatus = action === 'accept' ? 'accepte' : action === 'refuse' ? 'refuse' : q.status;
  await query('UPDATE quotes SET unread_admin = 1, status = ? WHERE id = ?', [newStatus, q.id]);
  await mailer.notifyClientMessage(q, body, action); // attendu : sur Vercel la fonction s'arrête après la réponse
  res.json({ ok: true, status: newStatus });
}));

/* ============================================================
   ADMIN — session
============================================================ */
// seuls les échecs comptent : 8 erreurs → blocage 15 min pour cette IP
const account = require('./account');
const FAIL_WINDOW = 15 * 60 * 1000;
function tooManyFails(req, scope) {
  const f = hits.get(`${scope}:${req.ip}`);
  return f && Date.now() - f.t < FAIL_WINDOW && f.n >= 8;
}
function noteFail(req, scope) {
  const key = `${scope}:${req.ip}`, now = Date.now();
  const f = hits.get(key);
  const e = f && now - f.t < FAIL_WINDOW ? f : { n: 0, t: now };
  e.n++; hits.set(key, e);
}

app.post('/api/admin/login', wrap(async (req, res) => {
  const { user, password } = req.body || {};
  if (tooManyFails(req, 'loginfail')) return res.status(429).json({ error: 'Trop de tentatives, réessaie dans 15 minutes.' });
  const acc = await account.verifyCredentials(str(user, 100), String(password ?? ''));
  if (!acc) {
    noteFail(req, 'loginfail');
    const hint = !process.env.ADMIN_PASSWORD && acc === null && (await account.getAccount()).source === 'env'
      ? " (ADMIN_PASSWORD n'est pas configuré sur le serveur)" : '';
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' + hint });
  }
  hits.delete(`loginfail:${req.ip}`);
  auth.setSessionCookie(req, res, auth.createToken(acc.user, acc.ver));
  res.json({ ok: true, user: acc.user });
}));

app.post('/api/admin/logout', (req, res) => { auth.clearSessionCookie(res); res.json({ ok: true }); });

app.get('/api/admin/me', wrap(async (req, res) => {
  const s = await auth.currentSession(req);
  if (!s) return res.status(401).json({ error: 'Non connecté' });
  res.json({
    user: s.u, mail: mailer.enabled(), categories: CATS, statuses: STATUSES, projectTypes: PROJECT_TYPES,
    account: { user: s.account.user, source: s.account.source, reset: process.env.ADMIN_RESET === '1' },
  });
}));

const admin = express.Router();
admin.use(auth.requireAdmin);

/* ---------- mon compte : identifiant + mot de passe ---------- */
admin.post('/account', wrap(async (req, res) => {
  if (tooManyFails(req, 'accountfail')) return res.status(429).json({ error: 'Trop de tentatives, réessaie dans 15 minutes.' });
  const b = req.body || {};
  const current = String(b.currentPassword ?? '');
  const newUser = str(b.newUser, 60) || req.account.user;
  const newPass = String(b.newPassword ?? '');
  const fields = {};
  if (!(await account.verifyCredentials(req.account.user, current))) {
    noteFail(req, 'accountfail');
    return res.status(422).json({ error: 'Mot de passe actuel incorrect.', fields: { currentPassword: 'Mot de passe actuel incorrect.' } });
  }
  if (!/^[A-Za-z0-9._@-]{3,40}$/.test(newUser)) fields.newUser = 'Identifiant : 3 à 40 caractères (lettres, chiffres, . _ - @), sans espace.';
  if (newPass) {
    if (newPass.length < 10) fields.newPassword = 'Au moins 10 caractères.';
    else if (newPass.length > 200) fields.newPassword = 'Mot de passe trop long.';
    else if (!/[A-Za-z]/.test(newPass) || !/[0-9]/.test(newPass)) fields.newPassword = 'Mélange au moins des lettres et des chiffres.';
    else if (newPass.toLowerCase() === newUser.toLowerCase()) fields.newPassword = "Le mot de passe ne doit pas être l'identifiant.";
    if (b.confirmPassword !== undefined && b.confirmPassword !== newPass) fields.confirmPassword = 'Les deux mots de passe ne correspondent pas.';
  }
  if (!newPass && newUser === req.account.user) return res.status(422).json({ error: 'Aucune modification à enregistrer.' });
  if (Object.keys(fields).length) return res.status(422).json({ error: 'Vérifie les champs signalés.', fields });
  hits.delete(`accountfail:${req.ip}`);
  const acc = await account.setAccount(newUser, newPass || current);
  auth.setSessionCookie(req, res, auth.createToken(acc.user, acc.ver)); // reste connecté sur cet appareil
  res.json({ ok: true, user: acc.user, passwordChanged: Boolean(newPass), userChanged: newUser !== req.account.user });
}));

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
  if (!partial || 'link' in b) {
    out.link_url = str(b.link, 500) || null;
    if (out.link_url && !/^https?:\/\/[^\s]+\.[^\s]+/.test(out.link_url)) errors.link = 'Lien invalide (doit commencer par https://).';
  }
  if (!partial || 'tags' in b) out.tags = str(Array.isArray(b.tags) ? b.tags.join(', ') : b.tags, 300) || null;
  if (!partial || 'src' in b) {
    out.image_url = str(b.src, 500);
    if (!/^(\/images\/|\/api\/media\/\d+$|https:\/\/)/.test(out.image_url)) errors.src = 'Image requise.';
    const m = out.image_url.match(/^\/api\/media\/(\d+)$/);
    out.media_id = m ? Number(m[1]) : null;
  }
  if ('pages' in b) {
    const list = Array.isArray(b.pages) ? b.pages.map((x) => str(x, 500)).filter(Boolean).slice(0, 60) : [];
    if (list.some((x) => !SRC_RE.test(x))) errors.pages = 'Page invalide.';
    else if (list.length > 1) {
      out.pages = JSON.stringify(list);
      out.image_url = list[0]; out.media_id = mediaIdOf(list[0]); delete errors.src;
    } else out.pages = null;
  }
  if ('featured' in b) out.featured = b.featured ? 1 : 0;
  if ('published' in b) out.published = b.published ? 1 : 0;
  return { data: out, errors };
}

async function cleanupMedia(mediaId) {
  if (!mediaId) return;
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM works WHERE media_id = ? OR image_url = ? OR pages LIKE ?',
    [mediaId, `/api/media/${mediaId}`, `%"/api/media/${mediaId}"%`]);
  if (Number(n) === 0) await query('DELETE FROM media WHERE id = ?', [mediaId]);
}
const allMediaIds = (w) => [...new Set([w.media_id, ...pagesOf(w).map(mediaIdOf)].filter(Boolean))];

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
  const [w] = await query('SELECT * FROM works WHERE id = ?', [id]);
  const keep = new Set(allMediaIds(w));
  for (const mid of allMediaIds(before)) if (!keep.has(mid)) await cleanupMedia(mid);
  res.json({ work: adminWork(w) });
}));

admin.delete('/works/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [w] = await query('SELECT * FROM works WHERE id = ?', [id]);
  if (!w) return res.status(404).json({ error: 'Création introuvable.' });
  await query('DELETE FROM works WHERE id = ?', [id]);
  for (const mid of allMediaIds(w)) await cleanupMedia(mid);
  res.json({ ok: true });
}));

admin.post('/works/merge', wrap(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map(Number).filter(Number.isInteger))] : [];
  const title = str(req.body?.title, 200);
  if (ids.length < 2) return res.status(422).json({ error: 'Sélectionne au moins 2 créas.' });
  if (title.length < 2) return res.status(422).json({ error: 'Donne un nom au projet.' });
  const rows = await query(`SELECT * FROM works WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  if (rows.length !== ids.length) return res.status(404).json({ error: 'Créa introuvable.' });
  if (rows.some((w) => w.cat === 'web')) return res.status(422).json({ error: 'Les réalisations web ne se regroupent pas.' });
  const ordered = ids.map((id) => rows.find((w) => w.id === id));
  const pages = ordered.flatMap(pagesOf).slice(0, 60);
  const keep = ordered[0];
  await query('UPDATE works SET title = ?, pages = ?, image_url = ?, media_id = ?, published = ?, featured = ?, position = ? WHERE id = ?',
    [title, JSON.stringify(pages), pages[0], mediaIdOf(pages[0]),
      ordered.some((w) => w.published) ? 1 : 0, ordered.some((w) => w.featured) ? 1 : 0,
      Math.min(...ordered.map((w) => Number(w.position))), keep.id]);
  const others = ordered.slice(1).map((w) => w.id);
  await query(`DELETE FROM works WHERE id IN (${others.map(() => '?').join(',')})`, others);
  const [w] = await query('SELECT * FROM works WHERE id = ?', [keep.id]);
  res.json({ work: adminWork(w) });
}));

admin.post('/works/:id/split', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const [w] = await query('SELECT * FROM works WHERE id = ?', [id]);
  if (!w) return res.status(404).json({ error: 'Création introuvable.' });
  const pages = pagesOf(w);
  if (pages.length < 2) return res.status(422).json({ error: 'Ce projet ne contient qu\'une image.' });
  const base = String(w.title).replace(/\s*[—–-]\s*\d+$/, '');
  await query('UPDATE works SET title = ?, pages = NULL, image_url = ?, media_id = ? WHERE id = ?', [`${base} — 1`.slice(0, 200), pages[0], mediaIdOf(pages[0]), id]);
  for (let i = 1; i < pages.length; i++) {
    await query('INSERT INTO works (title, cat, cat_label, description, image_url, media_id, featured, published, position) VALUES (?,?,?,?,?,?,0,?,?)',
      [`${base} — ${i + 1}`.slice(0, 200), w.cat, w.cat_label, w.description, pages[i], mediaIdOf(pages[i]), w.published, Number(w.position)]); // même position : départagées par id, donc dans l'ordre
  }
  const rows = await query('SELECT * FROM works WHERE id = ? OR (cat = ? AND title LIKE ?) ORDER BY position, id', [id, w.cat, `${base} — %`]);
  res.json({ works: rows.map(adminWork) });
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
