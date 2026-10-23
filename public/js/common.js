/* ============================================
   COMMUN — thème, menu mobile, en-tête, retour en haut
   (utilisé par index.html et suivi.html)
============================================ */
const NK = {
  esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  fcfa(n){ return n == null ? '' : Number(n).toLocaleString('fr-FR').replace(/ /g,' ') + ' F CFA'; },
  date(d){ try { return new Date(d).toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'}); } catch { return ''; } },
  dateTime(d){ try { return new Date(d).toLocaleString('fr-FR', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}); } catch { return ''; } },
  store: {
    get(k){ try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v){ try { localStorage.setItem(k, v); } catch {} },
  },
  async api(url, opts = {}){
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if(!res.ok){ const e = new Error(data.error || 'Erreur réseau'); e.status = res.status; e.fields = data.fields; throw e; }
    return data;
  },
  STATUS: {
    nouveau:      {label:'Reçue',            icon:'fa-inbox'},
    en_cours:     {label:'En étude',         icon:'fa-pen-ruler'},
    devis_envoye: {label:'Devis envoyé',     icon:'fa-file-invoice'},
    accepte:      {label:'Acceptée',         icon:'fa-handshake'},
    refuse:       {label:'Refusée',          icon:'fa-circle-xmark'},
    termine:      {label:'Projet livré',     icon:'fa-flag-checkered'},
    archive:      {label:'Archivée',         icon:'fa-box-archive'},
  },
};

/* thème clair / sombre */
(() => {
  const root = document.documentElement;
  const btn = document.getElementById('themeToggle');
  if(!btn) return;
  const apply = (t) => {
    root.classList.toggle('dark', t === 'dark');
    btn.innerHTML = t === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  };
  apply(NK.store.get('nk-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  btn.addEventListener('click', () => {
    const next = root.classList.contains('dark') ? 'light' : 'dark';
    apply(next); NK.store.set('nk-theme', next);
  });
})();

/* menu mobile */
(() => {
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('overlay');
  const burger = document.getElementById('burgerBtn');
  if(!drawer || !overlay || !burger) return;
  burger.addEventListener('click', () => { drawer.classList.add('open'); overlay.classList.add('show'); });
  const close = () => { drawer.classList.remove('open'); overlay.classList.remove('show'); };
  document.getElementById('drawerClose')?.addEventListener('click', close);
  overlay.addEventListener('click', close);
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
})();

/* en-tête au scroll + retour en haut + année */
(() => {
  const toTop = document.getElementById('toTop');
  const header = document.querySelector('header');
  window.addEventListener('scroll', () => {
    toTop?.classList.toggle('show', window.scrollY > 500);
    header?.classList.toggle('scrolled', window.scrollY > 20);
  }, {passive:true});
  toTop?.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
  const y = document.getElementById('year');
  if(y) y.textContent = new Date().getFullYear();
})();

/* ============================================
   Logos & cartes : la marge blanche est dessinée DANS l'image,
   pour que le « mode sombre forcé » des navigateurs mobiles ne la fonce pas.
============================================ */
NK._padCache = new Map();
NK.padImage = function(src, { ratio = 4/5, pad = 0.12, card = false, maxW = 720 } = {}){
  const key = [src, ratio, pad, card, maxW].join('|');
  if(NK._padCache.has(key)) return NK._padCache.get(key);
  const job = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const W = Math.min(maxW, Math.max(320, img.naturalWidth * 1.3));
        const H = Math.round(W / ratio);
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const x = cv.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
        const s = Math.min((W * (1 - 2*pad)) / img.naturalWidth, (H * (1 - 2*pad)) / img.naturalHeight);
        const w = img.naturalWidth * s, h = img.naturalHeight * s, ox = (W - w) / 2, oy = (H - h) / 2;
        if(card){
          const r = Math.max(4, w * 0.018);
          x.save(); x.shadowColor = 'rgba(16,20,43,.28)'; x.shadowBlur = W * 0.04; x.shadowOffsetY = W * 0.018;
          x.beginPath(); x.roundRect(ox, oy, w, h, r); x.fillStyle = '#fff'; x.fill(); x.restore();
          x.save(); x.beginPath(); x.roundRect(ox, oy, w, h, r); x.clip(); x.drawImage(img, ox, oy, w, h); x.restore();
          x.beginPath(); x.roundRect(ox + .5, oy + .5, w - 1, h - 1, r); x.lineWidth = Math.max(1, W / 360); x.strokeStyle = 'rgba(16,20,43,.18)'; x.stroke();
        } else {
          x.drawImage(img, ox, oy, w, h);
        }
        resolve(cv.toDataURL('image/jpeg', 0.92));
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = src;
  });
  NK._padCache.set(key, job);
  return job;
};
NK.applyPadded = function(imgEl, holder, opts){
  if(!imgEl || imgEl.dataset.padded) return;
  imgEl.dataset.padded = '1';
  const src = imgEl.getAttribute('src');
  NK.padImage(src, opts).then(url => { imgEl.src = url; holder && holder.classList.add('is-padded'); })
    .catch(() => { delete imgEl.dataset.padded; });
};
