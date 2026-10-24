/* ============================================
   SUIVI DE DEVIS — côté client
============================================ */
const $ = (id) => document.getElementById(id);
const resultEl = $('result');
let creds = null;

// pré-remplissage : ?code= dans l'URL, sinon dernière demande envoyée depuis ce navigateur
(() => {
  const params = new URLSearchParams(location.search);
  let saved = null;
  try { saved = JSON.parse(NK.store.get('nk-track') || 'null'); } catch {}
  const code = params.get('code') || saved?.code || '';
  $('tcode').value = code;
  if(saved && saved.code === code) $('temail').value = saved.email || '';
  if($('tcode').value && $('temail').value) load();
  else if($('tcode').value) $('temail').focus();
})();

$('trackForm').addEventListener('submit', (e) => { e.preventDefault(); load(); });

function setInvalid(id, bad){ $(id).closest('.field').classList.toggle('invalid', bad); }

async function load(){
  const code = $('tcode').value.trim().toUpperCase();
  const email = $('temail').value.trim().toLowerCase();
  const okCode = /^NK-[A-Z0-9]{4,}$/.test(code), okMail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  setInvalid('tcode', !okCode); setInvalid('temail', !okMail);
  if(!okCode || !okMail) return;
  $('trackErr').hidden = true;
  $('trackBtn').disabled = true;
  try {
    const data = await NK.api('/api/track', { method:'POST', body: JSON.stringify({ code, email }) });
    creds = { code, email };
    NK.store.set('nk-track', JSON.stringify(creds));
    render(data);
    if(window.innerWidth < 900) resultEl.scrollIntoView({behavior:'smooth', block:'start'});
  } catch (err) {
    $('trackErr').textContent = err.message;
    $('trackErr').hidden = false;
  } finally { $('trackBtn').disabled = false; }
}

const STEP_ORDER = ['nouveau', 'en_cours', 'devis_envoye', 'accepte'];
function stepsHtml(status){
  const idx = status === 'termine' ? 4 : status === 'refuse' ? 2 : STEP_ORDER.indexOf(status);
  const labels = ['Reçue', 'En étude', 'Devis envoyé', status === 'termine' ? 'Livré' : 'Accepté'];
  return `<div class="steps">${labels.map((l, i) => `<div class="step ${i <= idx ? 'on' : ''}">${l}</div>`).join('')}</div>`;
}

function render({ quote: q, messages }){
  const st = NK.STATUS[q.status] || { label: q.status, icon: 'fa-circle' };
  const canDecide = q.price && ['devis_envoye', 'en_cours'].includes(q.status);
  const closed = ['termine', 'archive'].includes(q.status);

  const thread = [
    `<div class="msg original"><span class="who">Votre demande · ${NK.dateTime(q.createdAt)}</span>${NK.esc(q.message)}</div>`,
    ...messages.map(m => `<div class="msg ${m.author}"><span class="who">${m.author === 'admin' ? 'Ns_le Kréatif' : 'Vous'} · ${NK.dateTime(m.createdAt)}</span>${NK.esc(m.body)}${m.price ? `\n<span class="msg-price">Proposition : ${NK.fcfa(m.price)}</span>` : ''}</div>`),
  ].join('');

  const waiting = !messages.some(m => m.author === 'admin');

  resultEl.innerHTML = `
    <div class="q-head">
      <div>
        <div class="q-code">${NK.esc(q.code)} · envoyée le ${NK.date(q.createdAt)}</div>
        <h2>${NK.esc(q.projectType)}</h2>
      </div>
      <span class="pill" data-s="${q.status}"><i class="fa-solid ${st.icon}"></i> ${st.label}</span>
    </div>
    ${q.status === 'refuse' ? '' : stepsHtml(q.status)}
    <div class="q-meta">
      <div><span>Nom</span><b>${NK.esc(q.name)}</b></div>
      ${q.budget ? `<div><span>Budget indiqué</span><b>${NK.esc(q.budget)}</b></div>` : ''}
      ${q.deadline ? `<div><span>Délai souhaité</span><b>${NK.esc(q.deadline)}</b></div>` : ''}
    </div>
    ${q.price ? `
      <div class="price-box">
        ${canDecide && q.options && q.options.length > 1 ? `
        <fieldset class="opt-choice">
          <legend>Choisissez votre option</legend>
          ${q.options.map((o, i) => `<label class="opt"><input type="radio" name="opt" value="${o.n}" ${i === 0 ? 'checked' : ''}><span><b>Option ${o.n} — ${NK.esc(o.name)}</b><strong>${NK.fcfa(o.price)}</strong></span></label>`).join('')}
        </fieldset>` : `<div><small>Montant proposé</small><strong>${NK.fcfa(q.price)}</strong></div>`}
        ${canDecide ? `<div class="acts">
          <button class="btn btn-gold" id="accBtn"><i class="fa-solid fa-check"></i> Accepter le devis</button>
          <button class="btn btn-light" id="refBtn">Refuser</button>
        </div>` : ''}
      </div>` : ''}
    ${waiting ? `<div class="notice ok"><i class="fa-solid fa-hourglass-half"></i> Votre demande est bien reçue, je vous réponds très vite.</div>` : ''}
    <div class="thread">${thread}</div>
    <div id="replyNotice"></div>
    ${closed ? '' : `
    <form class="reply-box" id="replyForm">
      <div class="field">
        <label for="rbody">Vous souhaitez ajouter une précision ou poser une question&nbsp;?</label>
        <textarea id="rbody" placeholder="Votre message…" maxlength="3000"></textarea>
      </div>
      <button class="btn btn-primary" type="submit"><i class="fa-solid fa-paper-plane"></i> Envoyer</button>
    </form>`}
  `;

  $('accBtn')?.addEventListener('click', () => {
    if(confirmInline('accBtn', 'Confirmer l\'acceptation')){
      const opt = document.querySelector('input[name="opt"]:checked');
      send('accept', opt ? Number(opt.value) : null);
    }
  });
  $('refBtn')?.addEventListener('click', () => {
    if(confirmInline('refBtn', 'Confirmer le refus')) send('refuse');
  });
  $('replyForm')?.addEventListener('submit', (e) => { e.preventDefault(); send(null); });
}

// double clic de confirmation sans boîte de dialogue
function confirmInline(id, label){
  const b = $(id);
  if(b.dataset.armed){ return true; }
  b.dataset.armed = '1';
  const old = b.innerHTML;
  b.innerHTML = `<i class="fa-solid fa-circle-question"></i> ${label}`;
  setTimeout(() => { if(b.isConnected){ delete b.dataset.armed; b.innerHTML = old; } }, 4000);
  return false;
}

async function send(action, option = null){
  const body = ($('rbody')?.value || '').trim();
  if(!action && body.length < 2){ $('rbody').focus(); return; }
  try {
    await NK.api('/api/track/reply', { method:'POST', body: JSON.stringify({ ...creds, body, action, ...(option != null ? { option } : {}) }) });
    const data = await NK.api('/api/track', { method:'POST', body: JSON.stringify(creds) });
    render(data);
    $('replyNotice').innerHTML = `<div class="notice ok">${action === 'accept' ? 'Merci ! Devis accepté, je vous contacte pour démarrer.' : action === 'refuse' ? 'C\'est noté. Merci pour votre retour.' : 'Message envoyé.'}</div>`;
  } catch (err) {
    $('replyNotice').innerHTML = `<div class="notice err">${NK.esc(err.message)}</div>`;
  }
}
