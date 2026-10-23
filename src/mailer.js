// Emails automatiques — totalement optionnels.
// Si SMTP_HOST / SMTP_USER / SMTP_PASS ne sont pas définis, rien n'est envoyé
// et l'admin répond via les boutons Email / WhatsApp.
let transporter = null;

function enabled() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!transporter) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
const fcfa = (n) => `${Number(n).toLocaleString('fr-FR').replace(/ /g, ' ')} F CFA`;

function layout(title, inner) {
  return `<!doctype html><html><body style="margin:0;background:#F5F6FA;font-family:Arial,Helvetica,sans-serif;color:#10142B">
  <div style="max-width:560px;margin:0 auto;padding:28px 16px">
    <div style="background:#0E2A5E;color:#fff;border-radius:14px 14px 0 0;padding:20px 24px;font-weight:800;font-size:20px">
      ns_le <span>kréatif</span>
    </div>
    <div style="background:#fff;border-radius:0 0 14px 14px;padding:24px;border:1px solid #E2E5F0;border-top:none">
      <h2 style="margin:0 0 14px;font-size:19px">${esc(title)}</h2>
      ${inner}
    </div>
    <p style="font-size:12px;color:#4B5170;text-align:center;margin-top:16px">Ns_le Kréatif — graphiste · designer · photographe — Saint-Louis, Sénégal</p>
  </div></body></html>`;
}

function trackUrl(code) {
  const base = (process.env.SITE_URL || '').replace(/\/$/, '');
  return `${base}/suivi.html?code=${encodeURIComponent(code)}`;
}

async function send(to, subject, html, replyTo) {
  if (!enabled() || !to) return false;
  try {
    await getTransporter().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, html, ...(replyTo ? { replyTo } : {}) });
    return true;
  } catch (e) {
    console.error('[mail] échec :', e.message);
    return false;
  }
}

async function notifyNewQuote(q) {
  const admin = process.env.ADMIN_NOTIFY_EMAIL;
  const base = (process.env.SITE_URL || '').replace(/\/$/, '');
  const p1 = send(admin, `Nouvelle demande de devis — ${q.project_type} (${q.code})`, layout('Nouvelle demande de devis', `
    <p><b>${esc(q.name)}</b> — ${esc(q.email)}${q.phone ? ' — ' + esc(q.phone) : ''}</p>
    <p><b>Projet :</b> ${esc(q.project_type)}${q.budget ? ' · <b>Budget :</b> ' + esc(q.budget) : ''}${q.deadline ? ' · <b>Délai :</b> ' + esc(q.deadline) : ''}</p>
    <p style="background:#F5F6FA;border-radius:10px;padding:14px">${nl2br(q.message)}</p>
    <p><a href="${base}/admin.html#devis/${q.id}" style="background:#0E2A5E;color:#fff;padding:11px 18px;border-radius:30px;text-decoration:none;font-weight:bold">Répondre dans l'admin</a></p>`), q.email);
  const p2 = send(q.email, `Votre demande de devis ${q.code} est bien reçue`, layout('Merci pour votre demande !', `
    <p>Bonjour ${esc(q.name)},</p>
    <p>J'ai bien reçu votre demande pour : <b>${esc(q.project_type)}</b>. Je reviens vers vous très vite avec une proposition.</p>
    <p>Votre code de suivi : <b style="font-size:18px;letter-spacing:1px">${esc(q.code)}</b></p>
    <p><a href="${trackUrl(q.code)}" style="background:#F2B705;color:#141414;padding:11px 18px;border-radius:30px;text-decoration:none;font-weight:bold">Suivre ma demande</a></p>`));
  const [a, c] = await Promise.all([p1, p2]);
  return { admin: a, client: c };
}

async function notifyReply(q, body, price) {
  return send(q.email, `Réponse à votre demande de devis ${q.code}`, layout('Réponse à votre demande', `
    <p>Bonjour ${esc(q.name)},</p>
    <div style="background:#F5F6FA;border-radius:10px;padding:14px">${nl2br(body)}</div>
    ${price ? `<p style="font-size:17px">Montant proposé : <b>${fcfa(price)}</b></p>` : ''}
    <p>Vous pouvez accepter le devis ou me répondre directement depuis votre espace de suivi :</p>
    <p><a href="${trackUrl(q.code)}" style="background:#0E2A5E;color:#fff;padding:11px 18px;border-radius:30px;text-decoration:none;font-weight:bold">Voir et répondre</a></p>
    <p style="color:#4B5170;font-size:13px">Code de suivi : ${esc(q.code)}</p>`));
}

async function notifyClientMessage(q, body, action) {
  const label = action === 'accept' ? 'a ACCEPTÉ le devis' : action === 'refuse' ? 'a refusé le devis' : 'a répondu';
  const base = (process.env.SITE_URL || '').replace(/\/$/, '');
  return send(process.env.ADMIN_NOTIFY_EMAIL, `${q.name} ${label} — ${q.code}`, layout(`${q.name} ${label}`, `
    ${body ? `<p style="background:#F5F6FA;border-radius:10px;padding:14px">${nl2br(body)}</p>` : ''}
    <p><a href="${base}/admin.html#devis/${q.id}" style="background:#0E2A5E;color:#fff;padding:11px 18px;border-radius:30px;text-decoration:none;font-weight:bold">Ouvrir la demande</a></p>`), q.email);
}

module.exports = { enabled, notifyNewQuote, notifyReply, notifyClientMessage };
