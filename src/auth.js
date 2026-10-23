const crypto = require('crypto');

const COOKIE = 'nk_admin';
const TTL_MS = 1000 * 60 * 60 * 12; // session de 12 h

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET manquant ou trop court (16 caractères minimum)');
  return s;
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

function createToken(user, ver = 'env') {
  const payload = b64(JSON.stringify({ u: user, v: ver, exp: Date.now() + TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function setSessionCookie(req, res, token) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${Math.floor(TTL_MS / 1000)}`];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

// Session valide = signature OK + non expirée + même identifiant/version que le compte actuel
// (changer d'identifiant ou de mot de passe déconnecte donc toutes les autres sessions).
async function currentSession(req) {
  const session = verifyToken(readCookie(req, COOKIE));
  if (!session) return null;
  const { getAccount } = require('./account');
  const acc = await getAccount();
  if (session.u !== acc.user || (session.v || 'env') !== acc.ver) return null;
  return { ...session, account: acc };
}

function requireAdmin(req, res, next) {
  currentSession(req).then((session) => {
    if (!session) return res.status(401).json({ error: 'Session expirée, reconnecte-toi.' });
    // protection CSRF : les requêtes qui modifient doivent venir de notre JS
    if (req.method !== 'GET' && req.headers['x-nk-admin'] !== '1') {
      return res.status(403).json({ error: 'Requête refusée.' });
    }
    req.admin = session.u;
    req.account = session.account;
    next();
  }, next);
}

module.exports = { createToken, verifyToken, currentSession, setSessionCookie, clearSessionCookie, requireAdmin, readCookie, COOKIE };
