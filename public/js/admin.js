/* ============================================
   ADMIN — Ns_le Kréatif
============================================ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fcfa = (n) => n == null ? '—' : Number(n).toLocaleString('fr-FR').replace(/ /g, ' ') + ' F CFA';
const when = (d) => {
  const dt = new Date(d), now = new Date(), diff = (now - dt) / 1000;
  if(diff < 60) return "à l'instant";
  if(diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if(diff < 86400 && dt.getDate() === now.getDate()) return `aujourd'hui ${dt.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}`;
  return dt.toLocaleDateString('fr-FR', {day:'numeric', month:'short', year: dt.getFullYear() === now.getFullYear() ? undefined : 'numeric'});
};
const fullDate = (d) => new Date(d).toLocaleString('fr-FR', {day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit'});

const STATUS = {
  nouveau:      {label:'Nouvelle',      icon:'fa-inbox'},
  en_cours:     {label:'En étude',      icon:'fa-pen-ruler'},
  devis_envoye: {label:'Devis envoyé',  icon:'fa-file-invoice'},
  accepte:      {label:'Acceptée',      icon:'fa-handshake'},
  refuse:       {label:'Refusée',       icon:'fa-circle-xmark'},
  termine:      {label:'Livrée',        icon:'fa-flag-checkered'},
  archive:      {label:'Archivée',      icon:'fa-box-archive'},
};
const pill = (s) => `<span class="pill" data-s="${s}"><i class="fa-solid ${STATUS[s]?.icon || 'fa-circle'}"></i> ${STATUS[s]?.label || s}</span>`;

const state = {
  me: null, categories: {}, works: [], quotes: [],
  wcat: 'all', wsearch: '', wvis: '',
  qfilter: 'actifs', qsearch: '', currentQuote: null,
};

/* ---------- toasts ---------- */
function toast(msg, err = false){
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.innerHTML = `<i class="fa-solid ${err ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i> ${esc(msg)}`;
  const box = $('#toasts');
  box.appendChild(t);
  while(box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => t.remove(), 3800);
}

/* ---------- API ---------- */
async function api(url, opts = {}){
  const isBlob = opts.body instanceof Blob;
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...opts,
    headers: { 'X-NK-Admin': '1', ...(isBlob ? {} : {'Content-Type': 'application/json'}), ...(opts.headers || {}) },
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if(res.status === 401 && !url.endsWith('/login')){ showLogin(); throw Object.assign(new Error(data.error || 'Session expirée'), {status:401}); }
  if(!res.ok) throw Object.assign(new Error(data.error || 'Erreur serveur'), {status: res.status, fields: data.fields});
  return data;
}

/* bouton à double clic pour les suppressions (pas de boîte de dialogue) */
function armed(btn, label = 'Confirmer ?'){
  if(btn.classList.contains('armed')) return true;
  btn.classList.add('armed');
  const old = btn.innerHTML;
  btn.dataset.old = old;
  btn.innerHTML = btn.classList.contains('icon-btn') ? '<i class="fa-solid fa-check"></i>' : `<i class="fa-solid fa-triangle-exclamation"></i> ${label}`;
  btn.title = label;
  setTimeout(() => { if(btn.isConnected){ btn.classList.remove('armed'); btn.innerHTML = old; btn.title = ''; } }, 3000);
  return false;
}

/* ============================================
   CONNEXION
============================================ */
function showLogin(){
  try { const last = localStorage.getItem('nk-admin-user'); if(last && !$('#luser').value) $('#luser').value = last; } catch {}
  $('#appView').hidden = true;
  $('#loginView').hidden = false;
  setTimeout(() => ($('#luser').value ? $('#lpass') : $('#luser')).focus(), 50);
}
async function boot(){
  try {
    const me = await fetch('/api/admin/me', {credentials:'same-origin'});
    if(!me.ok) return showLogin();
    const data = await me.json();
    state.me = data; state.categories = data.categories;
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    $('#hello').textContent = `Bonjour ${data.user} 👋`;
    try { localStorage.setItem('nk-admin-user', data.user); } catch {}
    fillCatSelect();
    route();
    refreshBadge();
    setInterval(refreshBadge, 60000);
  } catch {
    showLogin();
    $('#lerr').textContent = 'Serveur injoignable. Vérifie ta connexion.';
    $('#lpassField').classList.add('invalid');
  }
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#lpassField').classList.remove('invalid');
  $('#lbtn').disabled = true;
  try {
    await api('/api/admin/login', {method:'POST', body: JSON.stringify({user: $('#luser').value.trim(), password: $('#lpass').value})});
    $('#lpass').value = '';
    boot();
  } catch (err) {
    $('#lerr').textContent = err.message;
    $('#lpassField').classList.add('invalid');
    $('#lpass').select();
  } finally { $('#lbtn').disabled = false; }
});
$$('[data-logout]').forEach(b => b.addEventListener('click', async () => {
  await fetch('/api/admin/logout', {method:'POST', credentials:'same-origin'});
  showLogin();
}));
$$('[data-theme-toggle]').forEach(b => b.addEventListener('click', () => {
  const dark = document.documentElement.classList.toggle('dark');
  try { localStorage.setItem('nk-theme', dark ? 'dark' : 'light'); } catch {}
}));

/* ============================================
   ROUTAGE (#dashboard, #creas, #devis, #devis/12)
============================================ */
window.addEventListener('hashchange', route);
function route(){
  if($('#appView').hidden) return;
  const [view, id] = (location.hash.slice(1) || 'dashboard').split('/');
  const v = ['dashboard', 'creas', 'devis', 'compte'].includes(view) ? view : 'dashboard';
  $$('[data-section]').forEach(s => s.hidden = s.dataset.section !== v);
  $$('[data-view]').forEach(a => a.classList.toggle('active', a.dataset.view === v));
  if(v === 'dashboard') loadDashboard();
  if(v === 'creas') loadWorks();
  if(v === 'devis') loadQuotes(id ? Number(id) : null);
  if(v === 'compte') loadAccount();
  window.scrollTo(0, 0);
}

async function refreshBadge(){
  try {
    const s = await api('/api/admin/stats');
    $$('[data-unread]').forEach(b => { b.textContent = s.quotes.unread; b.hidden = !s.quotes.unread; });
    return s;
  } catch { return null; }
}

/* ============================================
   TABLEAU DE BORD
============================================ */
async function loadDashboard(){
  const s = await refreshBadge();
  if(!s) return;
  const by = Object.fromEntries(s.quotes.byStatus.map(r => [r.status, Number(r.n)]));
  const waiting = (by.nouveau || 0) + (by.en_cours || 0);
  $('#stats').innerHTML = `
    <a class="stat hl" href="#devis"><span>Non lues</span><strong>${s.quotes.unread}</strong><small>demande${s.quotes.unread > 1 ? 's' : ''} à ouvrir</small></a>
    <a class="stat" href="#devis"><span>À traiter</span><strong>${waiting}</strong><small>${by.devis_envoye || 0} devis en attente du client</small></a>
    <div class="stat"><span>Devis acceptés</span><strong style="font-size:22px; padding:5px 0 4px">${fcfa(s.quotes.acceptedTotal)}</strong><small>${(by.accepte || 0) + (by.termine || 0)} projet(s)</small></div>
    <a class="stat" href="#creas"><span>Créations</span><strong>${s.works.published}</strong><small>publiées · ${s.works.total - s.works.published} masquée(s)</small></a>`;
  $('#recent').innerHTML = s.quotes.recent.length
    ? s.quotes.recent.map(qItem).join('')
    : `<div class="empty"><i class="fa-solid fa-inbox"></i>Aucune demande pour l'instant. Elles arriveront ici dès qu'un client remplit le formulaire.</div>`;
  const max = Math.max(1, ...s.works.byCat.map(c => Number(c.n)));
  const counts = Object.fromEntries(s.works.byCat.map(c => [c.cat, Number(c.n)]));
  $('#catBars').innerHTML = Object.entries(state.categories).map(([k, label]) => `
    <div class="bar-row"><span>${esc(catName(k))}</span><div class="bar"><i style="width:${((counts[k] || 0) / max) * 100}%"></i></div><b>${counts[k] || 0}</b></div>`).join('');
}

function qItem(q){
  return `<a class="qitem ${q.unread ? 'unread' : ''}" href="#devis/${q.id}" data-qid="${q.id}">
    ${q.unread ? '<span class="dot-new" title="Non lue"></span>' : '<span></span>'}
    <span style="min-width:0"><div class="t">${esc(q.name)} · ${esc(q.projectType)}</div><div class="s">${esc(q.message)}</div></span>
    <span class="r">${pill(q.status)}<span>${when(q.updatedAt)}</span></span>
  </a>`;
}

/* ============================================
   CRÉATIONS
============================================ */
const CAT_NAMES = { affiche:'Affiches', logo:'Logos', carte:'Cartes de visite', brochure:'Brochures', mockup:'Mockups & Branding', charte:'Charte graphique', sport:'Design sport', web:'Réalisations web' };
const catName = (k) => CAT_NAMES[k] || state.categories[k] || k;

function fillCatSelect(){
  $('#wcat').innerHTML = Object.keys(state.categories).map(k => `<option value="${k}">${esc(catName(k))}</option>`).join('');
}

async function loadWorks(){
  if(!state.works.length) $('#wgrid').innerHTML = Array(8).fill('<div class="wcard skel" style="height:320px"></div>').join('');
  try {
    const { works } = await api('/api/admin/works');
    state.works = works;
    renderWorks();
  } catch (e) { if(e.status !== 401) toast(e.message, true); }
}

function filteredWorks(){
  const s = state.wsearch.toLowerCase();
  return state.works.filter(w =>
    (state.wcat === 'all' || w.cat === state.wcat) &&
    (!s || w.title.toLowerCase().includes(s) || (w.catLabel || '').toLowerCase().includes(s)) &&
    (!state.wvis || (state.wvis === 'pub' && w.published) || (state.wvis === 'hid' && !w.published) || (state.wvis === 'star' && w.featured)));
}
const canReorder = () => state.wcat === 'all' && !state.wsearch && !state.wvis;

function renderWorks(){
  const total = state.works.length, pub = state.works.filter(w => w.published).length, star = state.works.filter(w => w.featured).length;
  $('#worksSummary').textContent = `${total} créations · ${pub} publiées · ${star} dans le slider d'accueil`;
  const counts = {};
  state.works.forEach(w => counts[w.cat] = (counts[w.cat] || 0) + 1);
  $('#catChips').innerHTML = `<button class="chip ${state.wcat === 'all' ? 'active' : ''}" data-cat="all">Toutes <em>${total}</em></button>` +
    Object.keys(state.categories).map(k => `<button class="chip ${state.wcat === k ? 'active' : ''}" data-cat="${k}">${esc(catName(k))} <em>${counts[k] || 0}</em></button>`).join('');
  $$('#catChips .chip').forEach(c => c.addEventListener('click', () => { state.wcat = c.dataset.cat; renderWorks(); }));

  const list = filteredWorks();
  const reorder = canReorder();
  $('#dragHint').innerHTML = reorder
    ? '<i class="fa-solid fa-grip-vertical"></i> Glisse les cartes avec la poignée (ou les flèches sur mobile) pour changer l\'ordre sur le site.'
    : '<i class="fa-solid fa-circle-info"></i> Pour réordonner, affiche « Toutes » sans recherche ni filtre.';
  if(!list.length){
    $('#wgrid').innerHTML = `<div class="empty" style="grid-column:1/-1"><i class="fa-solid fa-images"></i>Aucune création ici.<br><br><button class="btn btn-gold" data-new-work><i class="fa-solid fa-plus"></i> Ajouter une créa</button></div>`;
    $('#wgrid [data-new-work]').addEventListener('click', () => openWork());
    return;
  }
  $('#wgrid').innerHTML = list.map(w => `
    <article class="wcard ${w.published ? '' : 'hidden-work'} ${['logo','carte'].includes(w.cat) ? 'is-logo' : ''} ${w.cat === 'carte' ? 'is-carte' : ''} ${w.cat === 'web' ? 'is-web' : ''} ${w.cat === 'mockup' ? 'is-mockup' : ''}" data-id="${w.id}">
      <div class="wthumb" data-edit style="--img:url('${esc(w.src)}')">
        <img src="${esc(w.src)}" alt="" loading="lazy">
        <div class="wbadges">
          ${w.featured ? '<span class="wbadge star"><i class="fa-solid fa-star"></i> Accueil</span>' : ''}
          ${w.published ? '' : '<span class="wbadge"><i class="fa-solid fa-eye-slash"></i> Masquée</span>'}
        </div>
        ${reorder ? `<span class="handle" draggable="true" title="Glisser pour déplacer" aria-hidden="true"><i class="fa-solid fa-grip-vertical"></i></span>
          <div class="move-btns"><button class="icon-btn" data-move="-1" aria-label="Avancer"><i class="fa-solid fa-arrow-left"></i></button><button class="icon-btn" data-move="1" aria-label="Reculer"><i class="fa-solid fa-arrow-right"></i></button></div>` : ''}
      </div>
      <div class="wbody"><span class="cat">${esc(w.catLabel)}</span><h3>${esc(w.title)}</h3></div>
      <div class="wacts">
        <button class="btn btn-ghost btn-sm grow" data-edit title="Modifier"><i class="fa-solid fa-pen"></i><span class="lbl-edit">Modifier</span></button>
        <button class="icon-btn ${w.featured ? 'on' : ''}" data-star title="${w.featured ? 'Retirer du slider' : 'Mettre dans le slider'}" aria-label="Slider d'accueil"><i class="fa-${w.featured ? 'solid' : 'regular'} fa-star"></i></button>
        <button class="icon-btn" data-vis title="${w.published ? 'Masquer du site' : 'Publier'}" aria-label="Visibilité"><i class="fa-solid ${w.published ? 'fa-eye' : 'fa-eye-slash'}"></i></button>
        <button class="icon-btn danger" data-del title="Supprimer" aria-label="Supprimer"><i class="fa-solid fa-trash"></i></button>
      </div>
    </article>`).join('');

  $$('#wgrid .wcard').forEach(card => {
    const id = Number(card.dataset.id);
    const w = state.works.find(x => x.id === id);
    $$('[data-edit]', card).forEach(el => el.addEventListener('click', (e) => { if(!e.target.closest('.handle, .move-btns')) openWork(w); }));
    $('[data-star]', card).addEventListener('click', () => patchWork(w, {featured: !w.featured}, w.featured ? 'Retirée du slider' : 'Ajoutée au slider d\'accueil'));
    $('[data-vis]', card).addEventListener('click', () => patchWork(w, {published: !w.published}, w.published ? 'Créa masquée du site' : 'Créa publiée'));
    $('[data-del]', card).addEventListener('click', async (e) => {
      if(!armed(e.currentTarget, 'Supprimer définitivement ?')) return;
      try {
        await api(`/api/admin/works/${id}`, {method:'DELETE'});
        state.works = state.works.filter(x => x.id !== id);
        renderWorks(); toast('Création supprimée');
      } catch (err) { toast(err.message, true); }
    });
    $$('[data-move]', card).forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); moveWork(id, Number(b.dataset.move)); }));
  });
  $$('#wgrid .wcard.is-logo').forEach(card => {
    const im = card.querySelector('.wthumb img'); if(!im || im.dataset.padded) return;
    im.dataset.padded = '1'; const isCarte = card.classList.contains('is-carte');
    padImage(im.getAttribute('src'), { ratio: 4/5, pad: isCarte ? 0.09 : 0.12, card: isCarte })
      .then(url => { im.src = url; card.classList.add('is-padded'); }).catch(() => { delete im.dataset.padded; });
  });
  if(reorder) enableDrag();
}


/* Logos & cartes : marge blanche dessinée DANS l'image (résiste au « mode sombre forcé » des navigateurs mobiles) */
const _padCache = new Map();
function padImage(src, { ratio = 4/5, pad = 0.12, card = false } = {}){
  const key = [src, ratio, pad, card].join('|');
  if(_padCache.has(key)) return _padCache.get(key);
  const job = new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const W = Math.min(560, Math.max(320, img.naturalWidth * 1.3)), H = Math.round(W / ratio);
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
        const s = Math.min((W*(1-2*pad))/img.naturalWidth, (H*(1-2*pad))/img.naturalHeight);
        const w = img.naturalWidth*s, h = img.naturalHeight*s, ox = (W-w)/2, oy = (H-h)/2;
        if(card){
          const r = Math.max(4, w*0.018);
          x.save(); x.shadowColor='rgba(16,20,43,.28)'; x.shadowBlur=W*0.04; x.shadowOffsetY=W*0.018; x.beginPath(); x.roundRect(ox,oy,w,h,r); x.fillStyle='#fff'; x.fill(); x.restore();
          x.save(); x.beginPath(); x.roundRect(ox,oy,w,h,r); x.clip(); x.drawImage(img,ox,oy,w,h); x.restore();
          x.beginPath(); x.roundRect(ox+.5,oy+.5,w-1,h-1,r); x.lineWidth=Math.max(1,W/360); x.strokeStyle='rgba(16,20,43,.18)'; x.stroke();
        } else x.drawImage(img, ox, oy, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.9));
      } catch (e) { reject(e); }
    };
    img.onerror = reject; img.src = src;
  });
  _padCache.set(key, job); return job;
}

async function patchWork(w, changes, msg){
  try {
    const { work } = await api(`/api/admin/works/${w.id}`, {method:'PUT', body: JSON.stringify(changes)});
    Object.assign(w, work);
    renderWorks(); toast(msg);
  } catch (err) { toast(err.message, true); }
}

/* ----- réordonner ----- */
async function saveOrder(){
  try {
    await api('/api/admin/works/reorder', {method:'POST', body: JSON.stringify({ids: state.works.map(w => w.id)})});
    toast('Ordre enregistré');
  } catch (err) { toast(err.message, true); loadWorks(); }
}
function moveWork(id, dir){
  const i = state.works.findIndex(w => w.id === id), j = i + dir;
  if(j < 0 || j >= state.works.length) return;
  [state.works[i], state.works[j]] = [state.works[j], state.works[i]];
  renderWorks(); saveOrder();
}
function enableDrag(){
  let dragId = null;
  $$('#wgrid .handle').forEach(h => {
    const card = h.closest('.wcard');
    h.addEventListener('dragstart', (e) => {
      dragId = Number(card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragId));
      e.dataTransfer.setDragImage(card, 40, 40);
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    h.addEventListener('dragend', () => { card.classList.remove('dragging'); $$('.drop-before, .drop-after').forEach(c => c.classList.remove('drop-before', 'drop-after')); });
  });
  $$('#wgrid .wcard').forEach(card => {
    card.addEventListener('dragover', (e) => {
      if(dragId == null) return;
      e.preventDefault();
      const r = card.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      card.classList.toggle('drop-after', after); card.classList.toggle('drop-before', !after);
    });
    card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const target = Number(card.dataset.id);
      const after = card.classList.contains('drop-after');
      card.classList.remove('drop-before', 'drop-after');
      if(dragId == null || dragId === target) return;
      const moving = state.works.find(w => w.id === dragId);
      state.works = state.works.filter(w => w.id !== dragId);
      let idx = state.works.findIndex(w => w.id === target);
      if(after) idx++;
      state.works.splice(idx, 0, moving);
      dragId = null;
      renderWorks(); saveOrder();
    });
  });
}

$('#wsearch').addEventListener('input', (e) => { state.wsearch = e.target.value.trim(); renderWorks(); });
$('#wvis').addEventListener('change', (e) => { state.wvis = e.target.value; renderWorks(); });

/* ----- modale ajout / modification ----- */
const dlg = $('#workDlg');
let editing = null, pendingBlob = null, currentSrc = '';

$$('[data-new-work]').forEach(b => b.addEventListener('click', () => openWork()));
$$('#workDlg [data-close]').forEach(b => b.addEventListener('click', () => dlg.close()));
dlg.addEventListener('click', (e) => { if(e.target === dlg) dlg.close(); });

function setPreview(src){
  const drop = $('#drop');
  drop.classList.remove('invalid');
  $$('img, .change', drop).forEach(n => n.remove());
  if(src){
    drop.insertAdjacentHTML('beforeend', `<img src="${esc(src)}" alt=""><span class="change"><i class="fa-solid fa-arrows-rotate"></i> Changer l'image</span>`);
  }
}

function openWork(w = null){
  editing = w; pendingBlob = null; currentSrc = w?.src || '';
  $('#workDlgTitle').textContent = w ? 'Modifier la création' : 'Nouvelle création';
  $('#wtitle').value = w?.title || '';
  $('#wcat').value = w?.cat || (state.wcat !== 'all' ? state.wcat : 'affiche');
  $('#wlabel').value = w?.catLabel || state.categories[$('#wcat').value] || '';
  $('#wlabel').dataset.auto = w ? '' : '1';
  $('#wdesc').value = w?.description || '';
  $('#wlink').value = w?.link || '';
  $('#wtags').value = (w?.tags || []).join(', ');
  $('#wlink').closest('.field').classList.remove('invalid');
  toggleWebFields();
  $('#wpub').checked = w ? w.published : true;
  $('#wfeat').checked = w ? w.featured : false;
  $('#uplInfo').textContent = "L'image est optimisée automatiquement avant l'envoi.";
  $('#wtitle').closest('.field').classList.remove('invalid');
  setPreview(currentSrc);
  dlg.showModal();
  setTimeout(() => (w ? $('#wtitle') : $('#drop')).focus(), 30);
}

$('#wcat').addEventListener('change', () => { if($('#wlabel').dataset.auto) $('#wlabel').value = state.categories[$('#wcat').value] || ''; toggleWebFields(); });

/* ----- réalisations web : lien, technologies, capture automatique ----- */
function toggleWebFields(){ $('#webFields').hidden = $('#wcat').value !== 'web'; }
const isUrl = (u) => /^https?:\/\/[^\s]+\.[^\s]+/.test(u);
function shotUrl(site){
  return 'https://api.microlink.io/?url=' + encodeURIComponent(site)
    + '&screenshot=true&screenshot.fullPage=true&screenshot.type=jpeg&meta=false&embed=screenshot.url'
    + '&viewport.width=1280&viewport.height=800&viewport.deviceScaleFactor=1&waitForTimeout=1500';
}
$('#wshot').addEventListener('click', () => {
  const link = $('#wlink').value.trim();
  const ok = isUrl(link);
  $('#wlink').closest('.field').classList.toggle('invalid', !ok);
  if(!ok){ $('#wlink').focus(); return; }
  pendingBlob = null; currentSrc = shotUrl(link);
  $('#uplInfo').textContent = 'Capture en cours… (quelques secondes la première fois)';
  setPreview(currentSrc);
  const img = $('#drop img');
  img.addEventListener('load', () => { $('#uplInfo').textContent = 'Capture du site prête ✓ (page entière, mise à jour automatique)'; }, { once:true });
  img.addEventListener('error', () => { $('#uplInfo').textContent = "Capture impossible pour ce lien — ajoute plutôt une image toi-même."; }, { once:true });
});
$('#wlabel').addEventListener('input', () => { $('#wlabel').dataset.auto = ''; });

/* compression côté navigateur : max 1800 px, JPEG (ou PNG si transparence possible) */
async function optimise(file){
  if(file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if(!bmp) throw new Error("Impossible de lire cette image.");
  const MAX = 1800;
  const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const cw = Math.round(bmp.width * scale), ch = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  const keepAlpha = file.type === 'image/png' || file.type === 'image/webp';
  if(!keepAlpha){ ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); }
  ctx.drawImage(bmp, 0, 0, cw, ch);
  const toBlob = (type, q) => new Promise(r => canvas.toBlob(r, type, q));
  let blob = keepAlpha ? await toBlob('image/png') : await toBlob('image/jpeg', 0.86);
  if(keepAlpha && blob.size > 1.5 * 1024 * 1024) blob = await toBlob('image/webp', 0.88);
  for(let q = 0.78; blob.size > 3.3 * 1024 * 1024 && q > 0.4; q -= 0.12){
    ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
    blob = await toBlob('image/jpeg', q);
  }
  return blob;
}

async function pickFile(file){
  if(!file) return;
  if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type)){ toast('Format non accepté (JPG, PNG, WEBP ou GIF).', true); return; }
  $('#uplInfo').textContent = 'Optimisation…';
  try {
    pendingBlob = await optimise(file);
    setPreview(URL.createObjectURL(pendingBlob));
    $('#uplInfo').textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} Mo → ${(pendingBlob.size / 1024).toFixed(0)} Ko`;
    if(!$('#wtitle').value) $('#wtitle').value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  } catch (err) { toast(err.message, true); $('#uplInfo').textContent = ''; }
}
$('#wfile').addEventListener('change', (e) => { pickFile(e.target.files[0]); e.target.value = ''; });
const drop = $('#drop');
drop.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); $('#wfile').click(); } });
drop.tabIndex = 0;
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('over')));
drop.addEventListener('drop', (e) => { e.preventDefault(); pickFile(e.dataTransfer.files[0]); });

$('#workForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('#wtitle').value.trim();
  const isWeb = $('#wcat').value === 'web';
  const link = isWeb ? $('#wlink').value.trim() : '';
  const okLink = !link || isUrl(link);
  $('#wlink').closest('.field').classList.toggle('invalid', !okLink);
  if(!okLink) return;
  if(isWeb && !pendingBlob && !currentSrc && link) currentSrc = shotUrl(link); // capture auto si pas d'image
  const okTitle = title.length >= 2, okImg = !!(pendingBlob || currentSrc);
  $('#wtitle').closest('.field').classList.toggle('invalid', !okTitle);
  $('#drop').classList.toggle('invalid', !okImg);
  if(!okImg) toast('Ajoute une image.', true);
  if(!okTitle || !okImg) return;
  const btn = $('#wsave');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement…';
  try {
    let src = currentSrc;
    if(pendingBlob){
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Envoi de l\'image…';
      const up = await api('/api/admin/media', {method:'POST', body: pendingBlob, headers: {'Content-Type': pendingBlob.type || 'image/jpeg'}});
      src = up.url;
    }
    const payload = {
      title, cat: $('#wcat').value, catLabel: $('#wlabel').value.trim(), description: $('#wdesc').value.trim(),
      src, published: $('#wpub').checked, featured: $('#wfeat').checked,
      link: isWeb ? (link || null) : null,
      tags: isWeb ? $('#wtags').value.trim() : null,
    };
    if(editing){
      const { work } = await api(`/api/admin/works/${editing.id}`, {method:'PUT', body: JSON.stringify(payload)});
      Object.assign(editing, work);
      toast('Création mise à jour');
    } else {
      const { work } = await api('/api/admin/works', {method:'POST', body: JSON.stringify(payload)});
      state.works.unshift(work);
      toast('Création ajoutée — elle est en tête du portfolio');
    }
    dlg.close();
    if(location.hash.startsWith('#creas')) renderWorks(); else location.hash = '#creas';
  } catch (err) { toast(err.message, true); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Enregistrer'; }
});

/* ============================================
   DEVIS
============================================ */
const QFILTERS = [
  ['actifs', 'À traiter'], ['nouveau', 'Nouvelles'], ['devis_envoye', 'Devis envoyés'],
  ['accepte', 'Acceptées'], ['termine', 'Livrées'], ['refuse', 'Refusées'], ['archive', 'Archivées'], ['', 'Toutes'],
];
let qTimer = null;
$('#qsearch').addEventListener('input', (e) => { state.qsearch = e.target.value.trim(); clearTimeout(qTimer); qTimer = setTimeout(() => fetchQuotes(), 250); });

async function loadQuotes(id){
  renderQChips();
  await fetchQuotes();
  if(id) openQuote(id);
  else { state.currentQuote = null; $('#qsplit').classList.remove('has-detail'); $('#qdetail').innerHTML = '<div class="empty"><i class="fa-solid fa-file-invoice"></i>Sélectionne une demande pour la lire et y répondre.</div>'; markActive(); }
}
function renderQChips(){
  $('#qchips').innerHTML = QFILTERS.map(([k, l]) => `<button class="chip ${state.qfilter === k ? 'active' : ''}" data-f="${k}">${l}</button>`).join('');
  $$('#qchips .chip').forEach(c => c.addEventListener('click', () => { state.qfilter = c.dataset.f; renderQChips(); fetchQuotes(); }));
  // version mobile : même filtre dans un menu déroulant
  const sel = $('#qselect');
  sel.innerHTML = QFILTERS.map(([k, l]) => `<option value="${k}" ${state.qfilter === k ? 'selected' : ''}>${l}</option>`).join('');
}
$('#qselect').addEventListener('change', (e) => { state.qfilter = e.target.value; renderQChips(); fetchQuotes(); });
async function fetchQuotes(){
  try {
    const p = new URLSearchParams({status: state.qfilter, q: state.qsearch});
    const { quotes } = await api(`/api/admin/quotes?${p}`);
    state.quotes = quotes;
    const unread = quotes.filter(q => q.unread).length;
    $('#quotesSummary').textContent = `${quotes.length} demande${quotes.length > 1 ? 's' : ''}${unread ? ` · ${unread} non lue${unread > 1 ? 's' : ''}` : ''}`;
    $('#qlist').innerHTML = quotes.length ? quotes.map(qItem).join('')
      : `<div class="empty"><i class="fa-solid fa-inbox"></i>${state.qsearch ? 'Aucun résultat.' : 'Rien dans cette liste.'}</div>`;
    markActive();
  } catch (e) { if(e.status !== 401) toast(e.message, true); }
}
function markActive(){ $$('#qlist .qitem').forEach(a => a.classList.toggle('active', Number(a.dataset.qid) === state.currentQuote)); }

function waNumber(phone){
  let d = String(phone || '').replace(/\D/g, '');
  if(d.startsWith('00')) d = d.slice(2);
  if(d.length === 9 && /^[37]/.test(d)) d = '221' + d; // numéro sénégalais sans indicatif
  return d;
}
const trackLink = (q) => `${location.origin}/suivi.html?code=${encodeURIComponent(q.code)}`;

function replyText(q, body, price){
  return `${body}${price ? `\n\nMontant proposé : ${fcfa(price)}` : ''}\n\nVous pouvez accepter le devis ou me répondre ici : ${trackLink(q)}\n(code ${q.code})\n\nNs_le Kréatif`;
}

async function openQuote(id){
  state.currentQuote = id; markActive();
  $('#qsplit').classList.add('has-detail');
  $('#qdetail').innerHTML = '<div class="skel" style="height:420px"></div>';
  let data;
  try { data = await api(`/api/admin/quotes/${id}`); }
  catch (e) { $('#qdetail').innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i>${esc(e.message)}</div>`; return; }
  const { quote: q, messages } = data;
  const item = state.quotes.find(x => x.id === id);
  if(item && item.unread){ item.unread = false; item.status = q.status; fetchQuotes(); refreshBadge(); }

  const first = q.name.split(' ')[0];
  const wa = waNumber(q.phone);
  const QUICK = [
    ['Accusé de réception', `Bonjour ${first},\n\nMerci pour votre demande ! Je l'étudie et je reviens vers vous très vite avec une proposition.`],
    ['Proposition de prix', `Bonjour ${first},\n\nMerci pour votre confiance. Pour votre ${q.projectType.toLowerCase()}, je vous propose :\n– \n– \n\nDélai de réalisation : \nRetouches incluses : 2\n\nPaiement : 50 % à la commande (Wave / Orange Money), le reste à la livraison.`],
    ['Besoin de précisions', `Bonjour ${first},\n\nMerci pour votre demande. Pour vous faire une proposition juste, pourriez-vous me préciser :\n– le format et le support (réseaux sociaux, impression…)\n– les textes et informations à intégrer\n– vos couleurs ou références préférées`],
    ['Projet livré', `Bonjour ${first},\n\nVotre projet est terminé, vous trouverez les fichiers finaux ici : \n\nMerci pour votre confiance, au plaisir de travailler à nouveau ensemble !`],
  ];

  $('#qdetail').innerHTML = `
    <a class="btn btn-ghost btn-sm back" href="#devis"><i class="fa-solid fa-arrow-left"></i> Toutes les demandes</a>
    <div class="qhead">
      <div>
        <div class="code mono">${esc(q.code)} · ${fullDate(q.createdAt)}</div>
        <h2>${esc(q.name)}</h2>
        <div style="color:var(--muted)">${esc(q.projectType)}</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        ${pill(q.status)}
        <select class="input" id="qstatus" style="width:auto; padding:7px 10px; font-size:13px;" aria-label="Changer le statut">
          ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === q.status ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="contact">
      <a class="btn btn-ghost btn-sm" href="mailto:${esc(q.email)}"><i class="fa-solid fa-envelope"></i> ${esc(q.email)}</a>
      ${q.phone ? `<a class="btn btn-ghost btn-sm" href="tel:${esc(q.phone.replace(/\s/g, ''))}"><i class="fa-solid fa-phone"></i> ${esc(q.phone)}</a>` : ''}
      ${wa ? `<a class="btn btn-wa btn-sm" href="https://wa.me/${wa}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>` : ''}
      <button class="btn btn-ghost btn-sm" id="copyLink"><i class="fa-solid fa-link"></i> Lien de suivi</button>
    </div>
    <div class="meta">
      <div><span>Budget indiqué</span><b>${esc(q.budget || '—')}</b></div>
      <div><span>Délai souhaité</span><b>${esc(q.deadline || '—')}</b></div>
      <div><span>Montant proposé</span><b>${q.price ? fcfa(q.price) : '—'}</b></div>
    </div>
    <div class="thread">
      <div class="msg original"><span class="who">Demande initiale · ${when(q.createdAt)}</span>${esc(q.message)}</div>
      ${messages.map(m => `<div class="msg ${m.author}"><span class="who">${m.author === 'admin' ? 'Toi' : esc(first)} · ${when(m.createdAt)}</span>${esc(m.body)}${m.price ? `\n<span class="price">${fcfa(m.price)}</span>` : ''}</div>`).join('')}
    </div>
    <form class="composer" id="replyForm" novalidate>
      <h3>Répondre à ${esc(first)}</h3>
      <div class="quick">${QUICK.map(([l], i) => `<button type="button" data-tpl="${i}"><i class="fa-solid fa-bolt"></i> ${l}</button>`).join('')}</div>
      <div class="field"><textarea id="rbody" placeholder="Ta réponse au client…" maxlength="5000"></textarea><span class="err">Écris une réponse.</span></div>
      <div class="row2">
        <div class="field">
          <label for="rprice">Montant du devis <span style="text-transform:none; font-weight:500">(facultatif)</span></label>
          <div class="price-input"><input id="rprice" inputmode="numeric" placeholder="${q.price ? q.price.toLocaleString('fr-FR') : 'ex. 25 000'}"></div>
          <span class="err">Montant invalide.</span>
        </div>
        <div class="field">
          <label for="rstatus">Statut après envoi</label>
          <select id="rstatus">
            <option value="">Automatique</option>
            ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="composer-foot">
        ${state.me.mail ? `<label class="check"><input type="checkbox" id="rmail" checked> Envoyer aussi par email automatiquement</label>` : `<span class="check"><i class="fa-solid fa-circle-info"></i> Après l'envoi, transmets la réponse par WhatsApp ou email en 1 clic.</span>`}
        <button class="btn btn-primary" type="submit" id="rsend"><i class="fa-solid fa-paper-plane"></i> Envoyer la réponse</button>
      </div>
      <div id="sentBox"></div>
    </form>
    <div class="danger-zone">
      ${q.status !== 'archive' ? '<button class="btn btn-ghost btn-sm" id="qarch"><i class="fa-solid fa-box-archive"></i> Archiver</button>' : ''}
      <button class="btn btn-danger btn-sm" id="qdel"><i class="fa-solid fa-trash"></i> Supprimer la demande</button>
    </div>`;

  $$('[data-tpl]').forEach(b => b.addEventListener('click', () => {
    const t = $('#rbody'); t.value = QUICK[Number(b.dataset.tpl)][1]; t.focus();
    const pos = t.value.indexOf('– \n'); if(pos > -1) t.setSelectionRange(pos + 2, pos + 2);
  }));
  $('#copyLink').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(trackLink(q)); toast('Lien de suivi copié'); }
    catch { prompt('Lien de suivi :', trackLink(q)); }
  });
  $('#qstatus').addEventListener('change', async (e) => {
    try { await api(`/api/admin/quotes/${id}`, {method:'PATCH', body: JSON.stringify({status: e.target.value})}); toast(`Statut : ${STATUS[e.target.value].label}`); openQuote(id); fetchQuotes(); }
    catch (err) { toast(err.message, true); }
  });
  $('#qarch')?.addEventListener('click', async () => {
    try { await api(`/api/admin/quotes/${id}`, {method:'PATCH', body: JSON.stringify({status: 'archive'})}); toast('Demande archivée'); location.hash = '#devis'; }
    catch (err) { toast(err.message, true); }
  });
  $('#qdel').addEventListener('click', async (e) => {
    if(!armed(e.currentTarget, 'Supprimer définitivement ?')) return;
    try { await api(`/api/admin/quotes/${id}`, {method:'DELETE'}); toast('Demande supprimée'); location.hash = '#devis'; refreshBadge(); }
    catch (err) { toast(err.message, true); }
  });

  $('#replyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = $('#rbody').value.trim();
    const rawPrice = $('#rprice').value.trim();
    const price = rawPrice ? Number(rawPrice.replace(/[\s. ]/g, '').replace(/f\s*cfa|fcfa|f/i, '')) : null;
    const okB = body.length >= 2, okP = price === null || (Number.isFinite(price) && price >= 0);
    $('#rbody').closest('.field').classList.toggle('invalid', !okB);
    $('#rprice').closest('.field').classList.toggle('invalid', !okP);
    if(!okB || !okP) return;
    const btn = $('#rsend'); btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Envoi…';
    try {
      const r = await api(`/api/admin/quotes/${id}/reply`, {method:'POST', body: JSON.stringify({
        body, price, status: $('#rstatus').value || undefined, sendEmail: $('#rmail') ? $('#rmail').checked : false,
      })});
      const text = replyText(q, body, price);
      await openQuote(id);
      fetchQuotes();
      $('#sentBox').innerHTML = `
        <div class="sent-box">
          <b><i class="fa-solid fa-circle-check"></i> Réponse enregistrée${r.emailSent ? ' et envoyée par email' : ''}. ${esc(first)} la voit sur sa page de suivi.</b>
          <div class="acts">
            ${wa ? `<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(text)}"><i class="fa-brands fa-whatsapp"></i> Envoyer sur WhatsApp</a>` : ''}
            ${r.emailSent ? '' : `<a class="btn btn-ghost btn-sm" href="mailto:${encodeURIComponent(q.email)}?subject=${encodeURIComponent(`Votre devis ${q.code} — Ns_le Kréatif`)}&body=${encodeURIComponent(text)}"><i class="fa-solid fa-envelope"></i> Envoyer par email</a>`}
          </div>
        </div>`;
      toast('Réponse envoyée');
    } catch (err) { toast(err.message, true); btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Envoyer la réponse'; }
  });
}

/* ============================================
   MON COMPTE
============================================ */
function loadAccount(){
  const acc = state.me?.account || { user: state.me?.user };
  $('#acUser').value = acc.user || '';
  $('#acWho').textContent = acc.user || '—';
  ['#acNew', '#acConfirm', '#acCurrent'].forEach(id => { $(id).value = ''; $(id).type = 'password'; });
  $$('.pw-eye i').forEach(i => i.className = 'fa-solid fa-eye');
  $('#resetNotice').hidden = !acc.reset;
  $('#acConfirmField').hidden = true; $('#pwMeter').hidden = true;
  clearAccountErrors();
}
function clearAccountErrors(){ $$('#accountForm .field').forEach(f => f.classList.remove('invalid')); $$('#accountForm [data-err]').forEach(e => e.textContent = ''); }
function accountError(name, msg){ const e = $(`#accountForm [data-err="${name}"]`); if(!e) return; e.textContent = msg; e.closest('.field').classList.add('invalid'); }

$$('.pw-eye').forEach(b => b.addEventListener('click', () => {
  const input = $('#' + b.dataset.eye); const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  b.querySelector('i').className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  b.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
}));

function strength(pw){
  let sc = 0;
  if(pw.length >= 10) sc++; if(pw.length >= 14) sc++;
  if(/[a-z]/.test(pw) && /[A-Z]/.test(pw)) sc++;
  if(/[0-9]/.test(pw)) sc++; if(/[^A-Za-z0-9]/.test(pw)) sc++;
  if(pw.length < 10 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) sc = Math.min(sc, 1);
  return [['Trop faible', 'weak'], ['Faible', 'weak'], ['Moyen', 'mid'], ['Bon', 'good'], ['Très bon', 'strong'], ['Excellent', 'strong']][sc];
}
$('#acNew').addEventListener('input', () => {
  const pw = $('#acNew').value;
  $('#acConfirmField').hidden = !pw; $('#pwMeter').hidden = !pw;
  if(!pw) return;
  const [label, cls] = strength(pw);
  const m = $('#pwMeter'); m.dataset.level = cls; m.querySelector('span').textContent = label;
});

$('#accountForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAccountErrors();
  const newUser = $('#acUser').value.trim(), newPassword = $('#acNew').value, confirmPassword = $('#acConfirm').value, currentPassword = $('#acCurrent').value;
  let bad = false;
  if(!/^[A-Za-z0-9._@-]{3,40}$/.test(newUser)){ accountError('newUser', 'Identifiant : 3 à 40 caractères (lettres, chiffres, . _ - @), sans espace.'); bad = true; }
  if(newPassword && newPassword !== confirmPassword){ accountError('confirmPassword', 'Les deux mots de passe ne correspondent pas.'); bad = true; }
  if(!currentPassword){ accountError('currentPassword', 'Entre ton mot de passe actuel pour valider.'); bad = true; }
  if(bad){ $('#accountForm .field.invalid input')?.focus(); return; }
  const btn = $('#acSave'); btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement…';
  try {
    const r = await api('/api/admin/account', { method:'POST', body: JSON.stringify({ newUser, newPassword, confirmPassword: newPassword ? confirmPassword : undefined, currentPassword }) });
    state.me.user = r.user; state.me.account = { ...(state.me.account || {}), user: r.user, source: 'db', reset: state.me.account?.reset };
    $('#hello').textContent = `Bonjour ${r.user} 👋`;
    $('#luser').value = r.user;
    try { localStorage.setItem('nk-admin-user', r.user); } catch {}
    toast(r.passwordChanged && r.userChanged ? 'Identifiant et mot de passe mis à jour' : r.passwordChanged ? 'Mot de passe mis à jour' : 'Identifiant mis à jour');
    loadAccount();
  } catch (err) {
    if(err.fields) Object.entries(err.fields).forEach(([k, m]) => accountError(k, m));
    else toast(err.message, true);
    if(err.status === 401 && !err.fields) return;
  } finally { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Enregistrer les modifications'; }
});

boot();
