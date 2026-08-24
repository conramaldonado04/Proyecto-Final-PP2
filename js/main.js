// Menú móvil
const burger = document.getElementById('navBurger');
const navLinks = document.getElementById('navLinks');

burger.addEventListener('click', () => {
  navLinks.classList.toggle('is-open');
});

// ===== Navegación por pestañas (sin scroll entre secciones) =====
const tabLinks = document.querySelectorAll('[data-tab]');
const tabPanels = document.querySelectorAll('.tab-panel');

function activateTab(tabId) {
  tabPanels.forEach(panel => {
    const isMatch = panel.id === tabId;
    panel.classList.toggle('is-active', isMatch);
  });

  tabLinks.forEach(link => {
    const isMatch = link.dataset.tab === tabId;
    link.classList.toggle('is-active', isMatch);
    link.setAttribute('aria-selected', String(isMatch));
  });

  window.scrollTo({ top: 0 });
  navLinks.classList.remove('is-open'); // cierra el menú mobile al elegir
}

tabLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    activateTab(link.dataset.tab);
  });
});

// Botones sueltos que también deben cambiar de pestaña (ej. CTAs del hero)
document.querySelectorAll('[data-goto-tab]').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.gotoTab));
});

// Pestaña inicial
activateTab('inicio');

// ===== Modal: solicitud de distribuidores =====
const modal = document.getElementById('modalDistribuidor');
const openModalBtns = document.querySelectorAll('[data-open-modal="distribuidor"]');
const closeModalEls = modal.querySelectorAll('[data-modal-close]');
const formDistribuidor = document.getElementById('formDistribuidor');
const modalFormWrap = document.getElementById('modalFormWrap');
const modalSuccess = document.getElementById('modalSuccess');

function openModal() {
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

openModalBtns.forEach(btn => btn.addEventListener('click', openModal));
closeModalEls.forEach(el => el.addEventListener('click', closeModal));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
});

formDistribuidor.addEventListener('submit', (e) => {
  e.preventDefault();

  const data = Object.fromEntries(new FormData(formDistribuidor).entries());

  // TODO (backend real): POST a /api/leads-distribuidor
  // Guarda esta solicitud en MongoDB como "lead" (no crea cuenta de compra).
  // El panel admin lista estos leads para que el equipo comercial los contacte.
  console.log('Solicitud de distribuidor:', data);

  modalFormWrap.hidden = true;
  modalSuccess.hidden = false;
});
