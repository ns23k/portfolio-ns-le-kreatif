// Compte administrateur modifiable depuis l'admin.
// - Identifiant + mot de passe chiffré (scrypt) stockés dans la table meta.
// - Tant qu'aucun compte n'est enregistré, on utilise ADMIN_USER / ADMIN_PASSWORD (variables Vercel).
// - Secours : mettre ADMIN_RESET=1 dans Vercel force à nouveau ADMIN_USER / ADMIN_PASSWORD
//   (utile en cas d'oubli du mot de passe), puis l'enlever une fois le nouveau mot de passe choisi.
const crypto = require('crypto');
const { query } = require('./db');

const KEYS = ['admin_user', 'admin_hash', 'admin_ver'];

function scryptHash(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function scryptVerify(password, stored) {
  const [algo, saltB64, hashB64] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const got = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(got, expected);
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const envAccount = () => ({ user: process.env.ADMIN_USER || 'admin', hash: null, ver: 'env', source: 'env' });

async function getAccount() {
  if (process.env.ADMIN_RESET === '1') return envAccount();
  const rows = await query(`SELECT k, v FROM meta WHERE k IN (${KEYS.map(() => '?').join(',')})`, KEYS);
  const m = Object.fromEntries(rows.map((r) => [r.k, r.v]));
  if (!m.admin_user || !m.admin_hash) return envAccount();
  return { user: m.admin_user, hash: m.admin_hash, ver: m.admin_ver || '1', source: 'db' };
}

async function verifyCredentials(user, pass) {
  const acc = await getAccount();
  const userOk = safeEqual(user, acc.user);
  let passOk;
  if (acc.hash) passOk = scryptVerify(pass, acc.hash);
  else passOk = Boolean(process.env.ADMIN_PASSWORD) && safeEqual(pass, process.env.ADMIN_PASSWORD);
  return userOk && passOk ? acc : null;
}

async function setAccount(user, password) {
  const ver = crypto.randomBytes(6).toString('hex'); // invalide toutes les anciennes sessions
  const values = [['admin_user', user], ['admin_hash', scryptHash(password)], ['admin_ver', ver]];
  for (const [k, v] of values) {
    await query('INSERT INTO meta (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, v]);
  }
  return { user, ver, source: 'db' };
}

module.exports = { getAccount, verifyCredentials, setAccount };
