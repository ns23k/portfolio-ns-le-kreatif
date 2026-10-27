/* ============================================
   PAGE D'ACCUEIL — créations chargées depuis l'API
   (repli sur works-fallback.json si le serveur ne répond pas)
============================================ */
const FILTER_LABELS = {
  affiche: 'Affiches', logo: 'Logos', carte: 'Cartes de visite',
  brochure: 'Brochures', mockup: 'Mockups & Branding', charte: 'Charte graphique',
};
const ALWAYS_SHOWN = ['charte']; // filtres visibles même sans création
let works = [];      // portfolio (hors sport)
let sportWorks = []; // design sport
let webWorks = [];   // réalisations web
let featured = [];   // slider d'accueil

async function loadWorks(){
  let list;
  try {
    const data = await NK.api('/api/works');
    list = data.works;
  } catch (e) {
    console.warn('API indisponible, affichage de la sélection locale.', e);
    try { list = await (await fetch('js/works-fallback.json')).json(); } catch { list = []; }
  }
  works = list.filter(w => w.cat !== 'sport' && w.cat !== 'web');
  webWorks = list.filter(w => w.cat === 'web');
  sportWorks = list.filter(w => w.cat === 'sport');
  featured = list.filter(w => w.featured);
  if(!featured.length) featured = works.slice(0, 6);

  buildSlider();
  buildFilters();
  renderGallery('all');
  renderSport();
  renderWeb();
  startCounter(list.length);
}

/* ============================================
   SLIDER HERO
============================================ */
const sliderEl = document.getElementById('heroSlider');
const dotsEl = document.getElementById('sliderDots');
let current = 0, slides = [], dots = [], autoSlide = null;

function buildSlider(){
  sliderEl.innerHTML = ''; dotsEl.innerHTML = '';
  featured.forEach((w, i) => {
    const s = document.createElement('div');
    s.className = 'slide' + (i === 0 ? ' active' : '') + (['logo','carte'].includes(w.cat) ? ' is-logo' : '') + (w.cat === 'carte' ? ' is-carte' : '') + (w.cat === 'mockup' ? ' is-mockup' : '');
    s.innerHTML = `<img src="${NK.esc(w.src)}" alt="${NK.esc(w.title)}"><div class="slide-caption">${NK.esc(w.title)}</div>`;
    sliderEl.appendChild(s);
    if(['logo','carte'].includes(w.cat)){ const im = s.querySelector('img'); NK.applyPadded(im, s, { ratio: 280/340, pad: w.cat === 'carte' ? 0.08 : 0.12, card: w.cat === 'carte' }); }
    const d = document.createElement('button');
    d.setAttribute('aria-label', `Visuel ${i + 1}`);
    if(i === 0) d.classList.add('active');
    d.addEventListener('click', () => goTo(i));
    dotsEl.appendChild(d);
  });
  slides = sliderEl.querySelectorAll('.slide');
  dots = dotsEl.querySelectorAll('button');
  current = 0;
  restartAuto();
}
function goTo(i){
  if(!slides.length) return;
  slides[current].classList.remove('active');
  dots[current].classList.remove('active');
  current = (i + slides.length) % slides.length;
  slides[current].classList.add('active');
  dots[current].classList.add('active');
}
function restartAuto(){ clearInterval(autoSlide); if(slides.length > 1) autoSlide = setInterval(() => goTo(current + 1), 4200); }
document.getElementById('sliderNext').addEventListener('click', () => goTo(current + 1));
document.getElementById('sliderPrev').addEventListener('click', () => goTo(current - 1));
const stage = document.querySelector('.stage');
stage.addEventListener('mouseenter', () => clearInterval(autoSlide));
stage.addEventListener('mouseleave', restartAuto);

/* ============================================
   GALERIE + FILTRES + LIGHTBOX
============================================ */
const galleryEl = document.getElementById('gallery');
const filtersEl = document.getElementById('filters');

function buildFilters(){
  const present = Object.keys(FILTER_LABELS).filter(c => ALWAYS_SHOWN.includes(c) || works.some(w => w.cat === c));
  filtersEl.innerHTML = `<button class="filter-btn active" data-filter="all">Tous</button>` +
    present.map(c => `<button class="filter-btn" data-filter="${c}">${FILTER_LABELS[c]}</button>`).join('');
  filtersEl.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filtersEl.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGallery(btn.dataset.filter);
    });
  });
}

function card(w, i){
  const item = document.createElement('div');
  item.className = 'g-item' + (['logo','carte'].includes(w.cat) ? ' is-logo' : '') + (w.cat === 'carte' ? ' is-carte' : '') + (w.cat === 'mockup' ? ' is-mockup' : '');
  item.tabIndex = 0;
  item.setAttribute('role', 'button');
  item.setAttribute('aria-label', `Agrandir : ${w.title}`);
  item.style.animationDelay = (Math.min(i, 12) * 0.05) + 's';
  item.innerHTML = `
    <div class="thumb" style="--img:url('${NK.esc(w.src)}')"><img src="${NK.esc(w.src)}" alt="${NK.esc(w.title)}" loading="lazy"></div>
    <div class="g-zoom"><i class="fa-solid fa-expand"></i></div>
    ${w.pages && w.pages.length > 1 ? `<span class="g-pages"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> ${w.pages.length} pages</span>` : ''}
    <div class="g-caption"><span class="cat">${NK.esc(w.catLabel)}</span><h4>${NK.esc(w.title)}</h4></div>`;
  if(['logo','carte'].includes(w.cat)) NK.applyPadded(item.querySelector('.thumb img'), item, { ratio: 4/5, pad: w.cat === 'carte' ? 0.09 : 0.12, card: w.cat === 'carte' });
  item.addEventListener('click', () => openLightbox(w));
  item.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openLightbox(w); } });
  return item;
}

function renderGallery(filter){
  galleryEl.innerHTML = '';
  const list = filter === 'all' ? works : works.filter(w => w.cat === filter);
  if(!list.length){
    galleryEl.innerHTML = filter === 'charte'
      ? '<div class="gallery-loading"><b>Chartes graphiques à venir</b><br>Logos, couleurs, typographies et règles d\'usage : les premières chartes arrivent bientôt. <a href="#contact" style="color:var(--brand); font-weight:600;">Besoin d\'une charte ? Demandez un devis →</a></div>'
      : '<div class="gallery-loading">Aucune création dans cette catégorie pour le moment.</div>';
    return;
  }
  list.forEach((w, i) => galleryEl.appendChild(card(w, i)));
}

const sportGalleryEl = document.getElementById('sportGallery');
const sportSection = document.getElementById('sport');
/* ============================================
   RÉALISATIONS WEB
============================================ */
function hostOf(u){ try { return new URL(u).host.replace(/^www\./,''); } catch { return ''; } }
/* capture du site en mode sombre quand le portfolio est en mode sombre (captures automatiques uniquement) */
const isDark = () => document.documentElement.classList.contains('dark');
function webShot(src){
  if(!isDark() || !/^https:\/\/api\.microlink\.io\//.test(src || '')) return src;
  return src + '&colorScheme=dark';
}
new MutationObserver(() => {
  document.querySelectorAll('#webGrid .shot img[data-light]').forEach(img => {
    const next = webShot(img.dataset.light);
    if(img.getAttribute('src') !== next) img.src = next;
  });
}).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

function renderWeb(){
  const grid = document.getElementById('webGrid');
  const section = document.getElementById('web');
  if(!grid) return;
  section.hidden = webWorks.length === 0;
  document.querySelectorAll('a[href="#web"]').forEach(a => (a.closest('li') || a).hidden = webWorks.length === 0);
  grid.innerHTML = webWorks.map(w => {
    const host = hostOf(w.link);
    return `
    <article class="web-card reveal">
      <a class="browser" ${w.link ? `href="${NK.esc(w.link)}" target="_blank" rel="noopener"` : ''} aria-label="${NK.esc(w.title)}${w.link ? ' — ouvrir le site' : ''}">
        <div class="browser-bar"><span class="dots"><i></i><i></i><i></i></span><span class="browser-url"><i class="fa-solid fa-lock"></i> ${NK.esc(host || w.title)}</span></div>
        <div class="shot"><img src="${NK.esc(webShot(w.src))}" data-light="${NK.esc(w.src)}" alt="Aperçu du site ${NK.esc(w.title)}" loading="lazy" decoding="async"></div>
      </a>
      <div class="web-body">
        <span class="cat">${NK.esc(w.catLabel)}</span>
        <h3>${NK.esc(w.title)}</h3>
        ${w.description ? `<p>${NK.esc(w.description)}</p>` : ''}
        ${w.tags && w.tags.length ? `<ul class="web-tags">${w.tags.map(t => `<li>${NK.esc(t)}</li>`).join('')}</ul>` : ''}
        ${w.link ? `<a class="btn btn-primary web-link" href="${NK.esc(w.link)}" target="_blank" rel="noopener">Voir le site <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : `<span class="web-soon"><i class="fa-regular fa-clock"></i> Mise en ligne prochainement</span>`}
      </div>
    </article>`;
  }).join('');
  grid.querySelectorAll('.web-card').forEach(el => io.observe(el));
  // défilement du site au survol : hauteur réelle de la capture
  grid.querySelectorAll('.shot img').forEach(img => {
    const set = () => {
      const box = img.parentElement;
      const dist = Math.max(0, img.getBoundingClientRect().height - box.getBoundingClientRect().height);
      box.style.setProperty('--scroll', `-${dist}px`);
      box.style.setProperty('--dur', `${Math.min(14, Math.max(3, dist / 260))}s`);
      box.classList.toggle('can-scroll', dist > 40);
    };
    if(img.complete) set();
    img.addEventListener('load', set);
    window.addEventListener('resize', set, { passive: true });
  });
}

function renderSport(){
  sportGalleryEl.innerHTML = '';
  sportSection.hidden = sportWorks.length === 0;
  document.querySelectorAll('a[href="#sport"]').forEach(a => (a.closest('li') || a).hidden = sportWorks.length === 0);
  sportWorks.forEach((w, i) => sportGalleryEl.appendChild(card(w, i)));
}

const lightbox = document.getElementById('lightbox');
const lbImg = document.getElementById('lightboxImg');
const lbTitle = document.getElementById('lightboxTitle');
const lbCat = document.getElementById('lightboxCat');
const lbDesc = document.getElementById('lightboxDesc');
let lastFocus = null;
let lbWork = null, lbIndex = 0;
const lbPrev = document.getElementById('lbPrev'), lbNext = document.getElementById('lbNext'), lbCount = document.getElementById('lbCount');
function showPage(i){
  const pages = lbWork.pages || [lbWork.src];
  lbIndex = (i + pages.length) % pages.length;
  lbImg.src = pages[lbIndex];
  lbImg.alt = `${lbWork.title} — page ${lbIndex + 1} sur ${pages.length}`;
  lbCount.textContent = `${lbIndex + 1} / ${pages.length}`;
  // précharge la page suivante
  if(pages.length > 1){ const pre = new Image(); pre.src = pages[(lbIndex + 1) % pages.length]; }
}
lbPrev.addEventListener('click', (e) => { e.stopPropagation(); showPage(lbIndex - 1); });
lbNext.addEventListener('click', (e) => { e.stopPropagation(); showPage(lbIndex + 1); });
document.addEventListener('keydown', (e) => {
  if(!lightbox.classList.contains('open') || !lbWork || (lbWork.pages || []).length < 2) return;
  if(e.key === 'ArrowRight') showPage(lbIndex + 1);
  if(e.key === 'ArrowLeft') showPage(lbIndex - 1);
});
let touchX = null;
lightbox.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
lightbox.addEventListener('touchend', (e) => {
  if(touchX === null || !lbWork || (lbWork.pages || []).length < 2) return;
  const dx = e.changedTouches[0].clientX - touchX; touchX = null;
  if(Math.abs(dx) > 45) showPage(lbIndex + (dx < 0 ? 1 : -1));
}, { passive: true });
function openLightbox(w){
  lastFocus = document.activeElement;
  lbWork = w;
  const multi = (w.pages || []).length > 1;
  lbPrev.hidden = lbNext.hidden = lbCount.hidden = !multi;
  lightbox.classList.toggle('is-multi', multi);
  lbImg.src = w.src; lbImg.alt = w.title; lbImg.hidden = false;
  if(multi) showPage(0);
  lightbox.classList.toggle('is-logo', ['logo','carte'].includes(w.cat));
  lightbox.classList.toggle('is-carte', w.cat === 'carte');
  lightbox.classList.remove('is-padded');
  if(['logo','carte'].includes(w.cat)){
    const opts = { ratio: w.cat === 'carte' ? 1.45 : 1.15, pad: w.cat === 'carte' ? 0.07 : 0.1, card: w.cat === 'carte', maxW: 1100 };
    NK.padImage(w.src, opts).then(url => { if(lbTitle.textContent === w.title){ lbImg.src = url; lightbox.classList.add('is-padded'); } }).catch(() => {});
  }
  lightbox.classList.toggle('is-mockup', w.cat === 'mockup');
  lbTitle.textContent = w.title;
  lbCat.textContent = w.catLabel;
  lbDesc.textContent = w.description || '';
  lbDesc.hidden = !w.description;
  lightbox.classList.add('open');
  document.getElementById('lightboxClose').focus();
}
function closeLightbox(){ lightbox.classList.remove('open'); lastFocus?.focus?.(); }
document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => { if(e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', (e) => { if(e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox(); });

/* ============================================
   FORMULAIRE DE DEVIS → enregistré en base
============================================ */
const form = document.getElementById('quoteForm');
const formDone = document.getElementById('formDone');
const formError = document.getElementById('formError');
const submitBtn = document.getElementById('formSubmit');
const F = (id) => document.getElementById(id);
const fieldMap = { name:'fname', email:'femail', phone:'fphone', projectType:'ftype', message:'fmsg' };

function setInvalid(id, invalid, msg){
  const field = F(id).closest('.field');
  field.classList.toggle('invalid', invalid);
  if(msg) field.querySelector('.err').textContent = msg;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.textContent = ''; formError.classList.remove('show');
  const v = {
    name: F('fname').value.trim(), email: F('femail').value.trim(), phone: F('fphone').value.trim(),
    projectType: F('ftype').value, budget: F('fbudget').value, deadline: F('fdeadline').value,
    message: F('fmsg').value.trim(), website: F('fwebsite').value,
  };
  const checks = {
    fname: v.name.length >= 2,
    femail: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email),
    fphone: v.phone === '' || /^[\d+\s().-]{7,20}$/.test(v.phone),
    ftype: v.projectType !== '',
    fmsg: v.message.length >= 10,
  };
  Object.entries(checks).forEach(([id, ok]) => setInvalid(id, !ok));
  if(Object.values(checks).includes(false)){
    form.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea')?.focus();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Envoi en cours…';
  try {
    const res = await NK.api('/api/quotes', { method:'POST', body: JSON.stringify(v) });
    NK.store.set('nk-track', JSON.stringify({ code: res.code, email: v.email.toLowerCase() }));
    F('doneCode').textContent = res.code;
    F('doneNote').textContent = res.emailSent
      ? `Un email de confirmation vient de vous être envoyé à ${v.email}.`
      : `Notez ce code : il vous suffira, avec votre email (${v.email}), pour suivre votre demande.`;
    F('doneTrack').href = `suivi.html?code=${encodeURIComponent(res.code)}`;
    form.hidden = true; formDone.hidden = false;
    form.reset();
  } catch (err) {
    if(err.fields){
      Object.entries(err.fields).forEach(([k, msg]) => fieldMap[k] && setInvalid(fieldMap[k], true, msg));
    } else {
      // serveur injoignable → on propose l'envoi par email comme avant
      const subject = encodeURIComponent(`Demande de devis — ${v.projectType}`);
      const body = encodeURIComponent(`Nom : ${v.name}\nEmail : ${v.email}\nTéléphone : ${v.phone || 'N/A'}\nType de projet : ${v.projectType}\nBudget : ${v.budget || '—'}\nDélai : ${v.deadline || '—'}\n\nMessage :\n${v.message}`);
      formError.innerHTML = `${NK.esc(err.message)} — <a href="mailto:etudeetudiant123@gmail.com?subject=${subject}&body=${body}">envoyer la demande par email</a> à la place.`;
      formError.classList.add('show');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Envoyer la demande';
  }
});
F('doneAgain').addEventListener('click', () => { formDone.hidden = true; form.hidden = false; F('fname').focus(); });

/* ============================================
   ANIMATIONS : reveal, barres de compétences, compteur
============================================ */
const io = new IntersectionObserver((entries) => {
  entries.forEach(en => { if(en.isIntersecting) en.target.classList.add('in'); });
}, {threshold:.15});
document.querySelectorAll('.reveal, .service-card').forEach(el => io.observe(el));

const io2 = new IntersectionObserver((entries) => {
  if(entries.some(en => en.isIntersecting)){
    document.querySelectorAll('.skill-bar i').forEach(bar => { bar.style.width = bar.dataset.w + '%'; });
    io2.disconnect();
  }
}, {threshold:.3});
io2.observe(document.getElementById('about'));

function startCounter(target){
  const statEl = document.getElementById('statProjects');
  const io3 = new IntersectionObserver((entries) => {
    if(!entries.some(en => en.isIntersecting)) return;
    io3.disconnect();
    let n = 0; const stepN = Math.max(1, Math.ceil(target / 40));
    const t = setInterval(() => { n = Math.min(target, n + stepN); statEl.textContent = n; if(n >= target) clearInterval(t); }, 40);
  }, {threshold:.5});
  io3.observe(document.querySelector('.hero-stats'));
}

loadWorks();
