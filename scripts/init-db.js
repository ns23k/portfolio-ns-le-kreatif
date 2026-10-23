// Facultatif : le serveur crée déjà les tables tout seul au premier appel.
// Utile pour vérifier la connexion à TiDB depuis ton ordinateur.
// Usage : npm run db:init
require('dotenv').config();
const { getPool } = require('../src/db');
const { ensureSchema } = require('../src/schema');

(async () => {
  try {
    await ensureSchema({ log: console.log });
  } catch (e) {
    console.error('✖ Erreur :', e.message);
    process.exitCode = 1;
  } finally {
    await getPool().end();
  }
})();
