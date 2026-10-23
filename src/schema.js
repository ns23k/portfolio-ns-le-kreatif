// Création des tables + import des créas d'origine, de façon idempotente.
// Appelé automatiquement au premier appel API (aucune commande manuelle nécessaire).
const fs = require('fs');
const path = require('path');
const { query } = require('./db');

const ROOT = path.join(__dirname, '..', 'scripts');

async function ensureSchema({ log = () => {} } = {}) {
  const sql = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  const statements = sql
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    .split(';').map((s) => s.trim()).filter(Boolean);
  for (const st of statements) await query(st);
  log('✔ Tables prêtes (works, media, quotes, quote_messages)');

  const [{ n }] = await query('SELECT COUNT(*) AS n FROM works');
  if (Number(n) === 0) {
    const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-works.json'), 'utf8'));
    const rows = seed.map((w, i) => [
      w.title, w.cat, w.cat_label, w.image_url.replace(/^images\//, '/images/'), w.featured ? 1 : 0, (i + 1) * 10,
    ]);
    await query('INSERT INTO works (title, cat, cat_label, image_url, featured, position) VALUES ?', [rows]);
    log(`✔ ${rows.length} créations importées depuis l'ancien site`);
  } else {
    log(`• ${n} créations déjà présentes — import ignoré`);
  }

  await migrate(log);
}

/* ---------- migrations (une seule fois chacune, mémorisées dans la table meta) ---------- */
function shotUrl(site) {
  return 'https://api.microlink.io/?url=' + encodeURIComponent(site)
    + '&screenshot=true&screenshot.fullPage=true&screenshot.type=jpeg&meta=false&embed=screenshot.url'
    + '&viewport.width=1280&viewport.height=800&viewport.deviceScaleFactor=1&waitForTimeout=1500';
}

async function addColumnIfMissing(table, column, definition) {
  const rows = await query(
    'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]);
  if (Number(rows[0].n) === 0) await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function migrate(log) {
  await query('CREATE TABLE IF NOT EXISTS meta (k VARCHAR(64) PRIMARY KEY, v VARCHAR(255) NULL) DEFAULT CHARSET = utf8mb4');
  await addColumnIfMissing('works', 'link_url', 'VARCHAR(500) NULL');
  await addColumnIfMissing('works', 'tags', 'VARCHAR(300) NULL');

  const done = await query("SELECT v FROM meta WHERE k = 'seed_web_v1'");
  if (!done.length) {
    const [{ p }] = await query('SELECT COALESCE(MAX(position), 0) + 10 AS p FROM works');
    await query(
      'INSERT INTO works (title, cat, cat_label, description, image_url, link_url, tags, featured, published, position) VALUES (?,?,?,?,?,?,?,0,1,?)',
      ['Ligeey', 'web', 'SaaS · Application web',
        "Logiciel en ligne pour les artisans et entreprises du Sénégal : devis, factures, planning des chantiers et fiches de travail, avec paiements Wave et Orange Money en FCFA.",
        shotUrl('https://ligeey-theta.vercel.app'), 'https://ligeey-theta.vercel.app', 'Next.js, Supabase, Vercel', Number(p)]);
    await query("INSERT INTO meta (k, v) VALUES ('seed_web_v1', 'ok')");
    log('✔ Réalisation web « Ligeey » ajoutée');
  }
}

let ready = globalThis.__nkSchemaReady;
function schemaReady() {
  if (!ready) {
    ready = ensureSchema().catch((e) => { ready = null; globalThis.__nkSchemaReady = null; throw e; });
    globalThis.__nkSchemaReady = ready;
  }
  return ready;
}

module.exports = { ensureSchema, schemaReady };
