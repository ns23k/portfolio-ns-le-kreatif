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

function createToken(user) {
  const payload = b64(JSON.stringify({ u: user, exp: Date.now() + TTL_MS }));
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

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function checkCredentials(user, pass) {
  const U = process.env.ADMIN_USER || 'admin';
  const P = process.env.ADMIN_PASSWORD;
  if (!P) return false;
  return safeEqual(user, U) & safeEqual(pass, P); // pas de court-circuit
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

function requireAdmin(req, res, next) {
  const session = verifyToken(readCookie(req, COOKIE));
  if (!session) return res.status(401).json({ error: 'Session expirée, reconnecte-toi.' });
  // protection CSRF : les requêtes qui modifient doivent venir de notre JS
  if (req.method !== 'GET' && req.headers['x-nk-admin'] !== '1') {
    return res.status(403).json({ error: 'Requête refusée.' });
  }
  req.admin = session.u;
  next();
}

module.exports = { createToken, verifyToken, checkCredentials, setSessionCookie, clearSessionCookie, requireAdmin, readCookie, COOKIE };
