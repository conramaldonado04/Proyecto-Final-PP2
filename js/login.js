(() => {
  const API = "http://127.0.0.1:3000/api/auth";

  const acciones = document.querySelector(".nav__actions");
  const ingresar = [...acciones.querySelectorAll("button")].find(
    (boton) => boton.textContent.trim() === "Ingresar",
  );

  const registrarme = acciones.querySelector(".registro-abrir");

  const cuenta = document.createElement("span");
  cuenta.style.fontWeight = "700";

  const salir = document.createElement("button");
  salir.type = "button";
  salir.className = "btn btn--ghost";
  salir.textContent = "Cerrar sesión";

  const estado = document.createElement("p");
  estado.setAttribute("role", "status");
  estado.style.fontSize = "14px";

  acciones.prepend(cuenta);
  acciones.append(salir);
  acciones.after(estado);

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

    <p class="registro-mensaje" role="status"
      aria-live="polite" data-estado="error"></p>
  `;

  document.body.append(dialog);

  const form = dialog.querySelector("form");
  const enviar = form.querySelector('[type="submit"]');
  const mensaje = dialog.querySelector(".registro-mensaje");

  let usuarioActual = null;
  let procesando = false;
  let overflowAnterior = "";

  function mostrarUsuario(usuario) {
    usuarioActual = usuario;
    cuenta.textContent = usuario ? `Hola, ${usuario.nombre}` : "";
    cuenta.style.display = usuario ? "" : "none";
    salir.style.display = usuario ? "" : "none";
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

  ingresar.addEventListener("click", () => {
    if (!procesando) {
      form.reset();
      mensaje.textContent = "";
    }

    overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    form.elements.email.focus();
  });

  dialog
    .querySelector(".registro-cerrar")
    .addEventListener("click", () => dialog.close());

  dialog.addEventListener("close", () => {
    document.body.style.overflow = overflowAnterior;

    if (!procesando) {
      form.elements.password.value = "";
    }

    (usuarioActual ? salir : ingresar).focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (procesando) return;

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
        mensaje.textContent = data.mensaje || "No se pudo iniciar sesión.";
        return;
      }

      mostrarUsuario(data.usuario);
      estado.textContent = "";
      form.reset();

      if (dialog.open) dialog.close();
    } catch {
      mensaje.textContent =
        "No pudimos confirmar el inicio de sesión. Revisá la conexión e intentá nuevamente.";

      if (!dialog.open) {
        estado.textContent = mensaje.textContent;
      }
    } finally {
      procesando = false;
      enviar.disabled = false;
      enviar.textContent = "Ingresar";

      if (!dialog.open) form.elements.password.value = "";
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
      estado.textContent = "Sesión cerrada.";
      ingresar.focus();
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
