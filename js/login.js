(() => {
  const API = "http://127.0.0.1:3000/api/auth";

  const acciones = document.querySelector(".nav__actions");
  const ingresar = [...acciones.querySelectorAll("button")].find(
    (boton) => boton.textContent.trim() === "Ingresar",
  );

  const registrarme = acciones.querySelector(".registro-abrir");
  ingresar.classList.add("nav__ingresar");

  // Menú de cuenta: "Hola, Nombre ▾" abre Mis pedidos / Panel / Cerrar sesión.
  const cuentaWrap = document.createElement("div");
  cuentaWrap.className = "nav__cuenta-wrap";

  const cuenta = document.createElement("button");
  cuenta.type = "button";
  cuenta.className = "nav__cuenta";
  cuenta.setAttribute("aria-haspopup", "true");
  cuenta.setAttribute("aria-expanded", "false");
  cuenta.setAttribute("aria-controls", "navMenu");

  const cuentaNombre = document.createElement("span");
  cuentaNombre.className = "nav__cuenta-nombre";
  const cuentaFlecha = document.createElement("span");
  cuentaFlecha.className = "nav__cuenta-flecha";
  cuentaFlecha.setAttribute("aria-hidden", "true");
  cuentaFlecha.textContent = "▾";
  cuenta.append(cuentaNombre, cuentaFlecha);

  const menu = document.createElement("div");
  menu.id = "navMenu";
  menu.className = "nav__menu";

  const salir = document.createElement("button");
  salir.type = "button";
  salir.className = "nav__item nav__salir";
  salir.textContent = "Cerrar sesión";

  menu.append(salir);
  cuentaWrap.append(cuenta, menu);

  const estado = document.createElement("p");
  estado.setAttribute("role", "status");
  estado.style.fontSize = "14px";

  acciones.prepend(cuentaWrap);
  acciones.after(estado);

  function cerrarMenu(devolverFoco) {
    menu.classList.remove("is-open");
    cuenta.setAttribute("aria-expanded", "false");
    if (devolverFoco) cuenta.focus();
  }
  cuenta.addEventListener("click", () => {
    const abierto = menu.classList.toggle("is-open");
    cuenta.setAttribute("aria-expanded", String(abierto));
  });
  menu.addEventListener("click", (e) => {
    if (e.target.closest("button")) cerrarMenu(false);
  });
  document.addEventListener("click", (e) => {
    if (!cuentaWrap.contains(e.target)) cerrarMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.classList.contains("is-open")) cerrarMenu(true);
  });

  const dialog = document.createElement("dialog");
  dialog.className = "registro-dialog";
  dialog.setAttribute("aria-labelledby", "loginTitulo");

  dialog.innerHTML = `
    <button type="button" class="registro-cerrar"
      aria-label="Cerrar inicio de sesión">✕</button>

    <p class="eyebrow eyebrow--dark">Naranpol · Clientes</p>
    <h2 id="loginTitulo">Ingresá a tu cuenta</h2>

    <form class="modal__form">
      <label for="loginEmail">Email</label>
      <input id="loginEmail" name="email" type="email"
        autocomplete="username" required maxlength="254">

      <label for="loginPassword">Contraseña</label>
      <input id="loginPassword" name="password" type="password"
        autocomplete="current-password" required>

      <button class="btn btn--primary" type="submit">
        Ingresar
      </button>
    </form>

    <p class="login-registro">
      ¿No tenés cuenta?
      <a href="#registro" data-abrir-registro>Registrarme</a>
    </p>

    <p class="registro-mensaje" role="status"
      aria-live="polite" data-estado="error"></p>
  `;

  document.body.append(dialog);

  const form = dialog.querySelector("form");
  const enviar = form.querySelector('[type="submit"]');
  const mensaje = dialog.querySelector(".registro-mensaje");

  const aviso = document.createElement("div");
  aviso.className = "login-aviso";
  aviso.setAttribute("role", "status");
  aviso.setAttribute("aria-live", "polite");
  aviso.setAttribute("aria-atomic", "true");
  document.body.append(aviso);
  let ocultarAviso;
  function avisar(texto) {
    clearTimeout(ocultarAviso);
    aviso.textContent = texto;
    aviso.classList.add("is-visible");
    ocultarAviso = setTimeout(() => {
      aviso.classList.remove("is-visible");
      aviso.textContent = "";
    }, 4000);
  }

  // Al iniciar o cerrar sesión se recarga la página para que toda la vista
  // (carrito, pedidos, botones) quede actualizada. El aviso se muestra tras recargar.
  function recargarConAviso(texto) {
    try {
      sessionStorage.setItem("narampol-aviso", texto);
    } catch {}
    location.reload();
  }
  try {
    const pendiente = sessionStorage.getItem("narampol-aviso");
    if (pendiente) {
      sessionStorage.removeItem("narampol-aviso");
      avisar(pendiente);
    }
  } catch {}

  // Solo el nombre de pila: el apellido queda guardado como dato de la cuenta.
  // Las cuentas viejas guardaban "Nombre Apellido" juntos: se toma la primera palabra.
  function nombreDePila(usuario) {
    const nombre = String(usuario.nombre || "").trim();
    return usuario.apellido ? nombre : nombre.split(/\s+/)[0];
  }

  let usuarioActual = null;
  let procesando = false;
  let pausaHasta = 0;
  let temporizador;
  function actualizarPausa() {
    const segundos = Math.max(0, Math.ceil((pausaHasta - Date.now()) / 1000));
    enviar.disabled = procesando || segundos > 0;
    enviar.textContent = segundos ? `Reintentar en ${segundos}s` : (procesando ? "Ingresando…" : "Ingresar");
    if (!segundos) {
      clearInterval(temporizador);
      if (pausaHasta) mensaje.textContent = "Ya podés volver a intentar.";
      pausaHasta = 0;
    }
  }
  let overflowAnterior = "";

  function mostrarUsuario(usuario) {
    usuarioActual = usuario;
    acciones.classList.toggle("is-logueado", Boolean(usuario));
    cuentaNombre.textContent = usuario ? `Hola, ${nombreDePila(usuario)}` : "";
    cuentaWrap.style.display = usuario ? "" : "none";
    if (!usuario) cerrarMenu(false);
    ingresar.style.display = usuario ? "none" : "";

    if (registrarme) {
      registrarme.style.display = usuario ? "none" : "";
    }
  }

  async function solicitar(ruta, opciones = {}) {
    const response = await fetch(`${API}${ruta}`, {
      ...opciones,
      credentials: "include",
      signal: AbortSignal.timeout(20000),
    });

    const data = await response.json();
    return { response, data };
  }

  function abrirLogin(textoInicial = "") {
    if (dialog.open) return;

    if (!procesando) {
      form.reset();
      mensaje.textContent = textoInicial;
    }

    overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    form.elements.email.focus();
  }

  ingresar.addEventListener("click", () => abrirLogin());

  // "¿No tenés cuenta? Registrarme": cierra el login y abre el registro.
  // El scroll se restablece en el momento (sin esperar al evento "close") para que el
  // registro guarde el estado correcto y no quede la página bloqueada al cerrarlo.
  dialog.querySelector("[data-abrir-registro]").addEventListener("click", (e) => {
    e.preventDefault();
    dialog.close();
    document.body.style.overflow = overflowAnterior;
    if (typeof window.abrirRegistro === "function") window.abrirRegistro();
  });

  // La tienda lo usa cuando alguien sin sesión toca el carrito, "Agregar" o "Mis pedidos".
  window.abrirInicioSesion = abrirLogin;

  dialog
    .querySelector(".registro-cerrar")
    .addEventListener("click", () => dialog.close());

  dialog.addEventListener("close", () => {
    // Si ya se abrió otro cuadro (el de registro), no se toca el scroll que ese cuadro bloqueó.
    if (!document.querySelector("dialog[open]")) {
      document.body.style.overflow = overflowAnterior;
    }

    if (!procesando) {
      form.elements.password.value = "";
    }

    (usuarioActual ? cuenta : ingresar).focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (procesando || Date.now() < pausaHasta) return;

    procesando = true;
    enviar.disabled = true;
    enviar.textContent = "Ingresando…";
    mensaje.textContent = "";

    try {
      const { response, data } = await solicitar("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.elements.email.value.trim().toLowerCase(),
          password: form.elements.password.value,
        }),
      });

      if (!response.ok) {
        if (response.status === 429 && Number.isFinite(data.reintentarEn)) {
          pausaHasta = Date.now() + Math.max(1, data.reintentarEn) * 1000;
          clearInterval(temporizador);
          temporizador = setInterval(actualizarPausa, 1000);
        }
        mensaje.textContent = data.mensaje || "No se pudo iniciar sesión.";
        return;
      }

      mostrarUsuario(data.usuario);
      estado.textContent = "";
      form.reset();

      if (dialog.open) dialog.close();
      recargarConAviso("¡Iniciaste sesión correctamente!");
    } catch {
      mensaje.textContent =
        "No pudimos confirmar el inicio de sesión. Revisá la conexión e intentá nuevamente.";

      if (!dialog.open) {
        estado.textContent = mensaje.textContent;
      }
    } finally {
      procesando = false;
      actualizarPausa();

      form.elements.password.value = "";
    }
  });

  salir.addEventListener("click", async () => {
    salir.disabled = true;
    estado.textContent = "";

    try {
      const { response, data } = await solicitar("/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        estado.textContent = data.mensaje || "No se pudo cerrar la sesión.";
        return;
      }

      mostrarUsuario(null);
      estado.textContent = "";
      recargarConAviso("Sesión cerrada correctamente.");
    } catch {
      estado.textContent =
        "No pudimos confirmar el cierre de sesión. Intentá nuevamente.";
    } finally {
      salir.disabled = false;
    }
  });

  // Recupera la sesión cuando se abre o recarga la página.
  async function recuperarSesion() {
    ingresar.disabled = true;

    try {
      const { response, data } = await solicitar("/sesion");

      if (response.ok) {
        mostrarUsuario(data.usuario);
      } else if (response.status === 401) {
        mostrarUsuario(null);
      } else {
        estado.textContent = "No pudimos comprobar tu sesión.";
      }
    } catch {
      estado.textContent = "No pudimos conectar con el servicio de cuentas.";
    } finally {
      ingresar.disabled = false;
    }
  }

  mostrarUsuario(null);
  recuperarSesion();
})();
