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
