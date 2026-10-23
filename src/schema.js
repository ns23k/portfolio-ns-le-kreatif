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
