// Menú móvil
const burger = document.getElementById("navBurger");
const navLinks = document.getElementById("navLinks");

burger.addEventListener("click", () => {
  const abierto = navLinks.classList.toggle("is-open");
  burger.setAttribute("aria-expanded", String(abierto));
});

// ===== Navegación por pestañas (sin scroll entre secciones) =====
const tabLinks = document.querySelectorAll("[data-tab]");
const tabPanels = document.querySelectorAll(".tab-panel");

function activateTab(tabId) {
  if (![...tabPanels].some((panel) => panel.id === tabId)) return;
  tabPanels.forEach((panel) => {
    const isMatch = panel.id === tabId;
    panel.classList.toggle("is-active", isMatch);
  });

  tabLinks.forEach((link) => {
    const isMatch = link.dataset.tab === tabId;
    link.classList.toggle("is-active", isMatch);
    link.setAttribute("aria-selected", String(isMatch));
  });

  window.scrollTo({ top: 0 });
  navLinks.classList.remove("is-open"); // cierra el menú mobile al elegir
  burger.setAttribute("aria-expanded", "false");
  // Volver a Mis pedidos después de la recarga que realiza el inicio de sesión.
  try {
    if (tabId === "pedidos") sessionStorage.setItem("naranpol-vista", "pedidos");
    else sessionStorage.removeItem("naranpol-vista");
  } catch {}
  window.dispatchEvent(new CustomEvent("naranpol:tab-cambiado", { detail: { tabId } }));
}

tabLinks.forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    activateTab(link.dataset.tab);
  });
});

// Botones sueltos que también deben cambiar de pestaña (ej. CTAs del hero)
document.querySelectorAll("[data-goto-tab]").forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    activateTab(btn.dataset.gotoTab);
  });
});

// Pestaña inicial
let vistaInicial = "inicio";
try {
  if (sessionStorage.getItem("naranpol-vista") === "pedidos") vistaInicial = "pedidos";
} catch {}
activateTab(vistaInicial);
burger.setAttribute("aria-controls", "navLinks");
burger.setAttribute("aria-expanded", "false");

// ===== Modal: solicitud de distribuidores =====
const modal = document.getElementById("modalDistribuidor");
function actualizarBloqueoScroll() {
  const modalDistribuidorAbierto = modal && modal.classList.contains("is-open");

  const dialogoTiendaAbierto = document.querySelector(".tienda-dialog[open], .aviso-proximamente[open]");

  document.body.style.overflow =
    modalDistribuidorAbierto || dialogoTiendaAbierto ? "hidden" : "";
}

window.actualizarBloqueoScroll = actualizarBloqueoScroll;
const openModalBtns = document.querySelectorAll(
  '[data-open-modal="distribuidor"]',
);
const closeModalEls = modal.querySelectorAll("[data-modal-close]");
const formDistribuidor = document.getElementById("formDistribuidor");
const modalFormWrap = document.getElementById("modalFormWrap");
const modalSuccess = document.getElementById("modalSuccess");

function openModal() {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  actualizarBloqueoScroll();
}

function closeModal() {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  actualizarBloqueoScroll();
}

openModalBtns.forEach((btn) => btn.addEventListener("click", openModal));
closeModalEls.forEach((el) => el.addEventListener("click", closeModal));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
});

formDistribuidor.addEventListener("submit", (e) => {
  e.preventDefault();

  const data = Object.fromEntries(new FormData(formDistribuidor).entries());

  // TODO (backend real): POST a /api/leads-distribuidor
  // Guarda esta solicitud en MongoDB como "lead" (no crea cuenta de compra).
  // El panel admin lista estos leads para que el equipo comercial los contacte.
  console.log("Solicitud de distribuidor:", data);

  modalFormWrap.hidden = true;
  modalSuccess.hidden = false;
});

// ===== Avisos del footer =====
const avisoProximamente = document.getElementById("avisoProximamente");
let origenAviso;
document.querySelectorAll("[data-proximamente]").forEach((boton) => {
  boton.addEventListener("click", () => {
    origenAviso = boton;
    document.getElementById("proximamenteContexto").textContent = boton.dataset.proximamente;
    avisoProximamente.showModal();
    actualizarBloqueoScroll();
  });
});
avisoProximamente.querySelectorAll("[data-cerrar-aviso]").forEach((boton) => {
  boton.addEventListener("click", () => avisoProximamente.close());
});
avisoProximamente.addEventListener("click", (event) => {
  const rect = avisoProximamente.getBoundingClientRect();
  if (event.target === avisoProximamente &&
      (event.clientX < rect.left || event.clientX > rect.right ||
       event.clientY < rect.top || event.clientY > rect.bottom)) avisoProximamente.close();
});
avisoProximamente.addEventListener("close", () => {
  actualizarBloqueoScroll();
  origenAviso?.focus({ preventScroll: true });
});
