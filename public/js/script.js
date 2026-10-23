/* ============================================
   PAGE D'ACCUEIL — créations chargées depuis l'API
   (repli sur works-fallback.json si le serveur ne répond pas)
============================================ */
const FILTER_LABELS = {
  affiche: 'Affiches', logo: 'Logos', carte: 'Cartes de visite',
  brochure: 'Brochures', mockup: 'Mockups & Branding',
};
let works = [];      // portfolio (hors sport)
let sportWorks = []; // design sport
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
  works = list.filter(w => w.cat !== 'sport');
  sportWorks = list.filter(w => w.cat === 'sport');
  featured = list.filter(w => w.featured);
  if(!featured.length) featured = works.slice(0, 6);

  buildSlider();
  buildFilters();
  renderGallery('all');
  renderSport();
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
    s.className = 'slide' + (i === 0 ? ' active' : '') + (w.cat === 'logo' ? ' is-logo' : '');
    s.innerHTML = `<img src="${NK.esc(w.src)}" alt="${NK.esc(w.title)}"><div class="slide-caption">${NK.esc(w.title)}</div>`;
    sliderEl.appendChild(s);
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
  const present = Object.keys(FILTER_LABELS).filter(c => works.some(w => w.cat === c));
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
  item.className = 'g-item' + (w.cat === 'logo' ? ' is-logo' : '');
  item.tabIndex = 0;
  item.setAttribute('role', 'button');
  item.setAttribute('aria-label', `Agrandir : ${w.title}`);
  item.style.animationDelay = (Math.min(i, 12) * 0.05) + 's';
  item.innerHTML = `
    <div class="thumb"><img src="${NK.esc(w.src)}" alt="${NK.esc(w.title)}" loading="lazy"></div>
    <div class="g-zoom"><i class="fa-solid fa-expand"></i></div>
    <div class="g-caption"><span class="cat">${NK.esc(w.catLabel)}</span><h4>${NK.esc(w.title)}</h4></div>`;
  item.addEventListener('click', () => openLightbox(w));
  item.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openLightbox(w); } });
  return item;
}

function renderGallery(filter){
  galleryEl.innerHTML = '';
  const list = filter === 'all' ? works : works.filter(w => w.cat === filter);
  if(!list.length){ galleryEl.innerHTML = '<div class="gallery-loading">Aucune création dans cette catégorie pour le moment.</div>'; return; }
  list.forEach((w, i) => galleryEl.appendChild(card(w, i)));
}

const sportGalleryEl = document.getElementById('sportGallery');
const sportSection = document.getElementById('sport');
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
function openLightbox(w){
  lastFocus = document.activeElement;
  lbImg.src = w.src; lbImg.alt = w.title; lbImg.hidden = false;
  lightbox.classList.toggle('is-logo', w.cat === 'logo');
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
