(() => {
  'use strict';
  const dialog = document.createElement('dialog');
  dialog.className = 'registro-dialog';
  dialog.setAttribute('aria-labelledby', 'registroTitulo');
  dialog.innerHTML = `
    <button type="button" class="registro-cerrar" aria-label="Cerrar registro">✕</button>
    <p class="eyebrow eyebrow--dark">Naranpol · Clientes</p>
    <h2 id="registroTitulo">Creá tu cuenta</h2>
    <p class="registro-intro">Registrate con tus datos. La dirección de entrega se completa al hacer el pedido.</p>
    <form class="modal__form" id="formRegistro">
      <div class="modal__form-row">
        <div>
          <label for="registroNombre">Nombre</label>
          <input id="registroNombre" name="nombre" autocomplete="given-name" required minlength="2" maxlength="50">
        </div>
        <div>
          <label for="registroApellido">Apellido</label>
          <input id="registroApellido" name="apellido" autocomplete="family-name" required minlength="2" maxlength="50">
        </div>
      </div>
      <label for="registroDni">DNI</label>
      <input id="registroDni" name="dni" inputmode="numeric" autocomplete="off" required maxlength="10" aria-describedby="registroDatosAyuda" placeholder="Solo números">
      <label for="registroCuit">CUIT / CUIL <span class="registro-opcional">(opcional)</span></label>
      <input id="registroCuit" name="cuit" inputmode="numeric" autocomplete="off" maxlength="13" aria-describedby="registroDatosAyuda" placeholder="Ej.: 20-12345678-6">
      <small id="registroDatosAyuda">Usamos estos datos únicamente para emitir tus facturas. Si necesitás factura A, completá el CUIT.</small>
      <label for="registroEmail">Email</label>
      <input id="registroEmail" name="email" type="email" autocomplete="email" required maxlength="254">
      <label for="registroEmailConfirmar">Volvé a ingresar tu email</label>
      <input id="registroEmailConfirmar" name="emailConfirmacion" type="email" autocomplete="email" required maxlength="254">
      <label for="registroPassword">Contraseña</label>
      <input id="registroPassword" name="password" type="password" autocomplete="new-password" required minlength="8" aria-describedby="registroAyuda">
      <small id="registroAyuda">Usá al menos 8 caracteres.</small>
      <label for="registroConfirmar">Repetí la contraseña</label>
      <input id="registroConfirmar" name="confirmar" type="password" autocomplete="new-password" required minlength="8">
      <button class="btn btn--primary" type="submit">Crear cuenta</button>
    </form>
    <p class="registro-mensaje" role="status" aria-live="polite" tabindex="-1"></p>
  `;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const mensaje = dialog.querySelector('.registro-mensaje');
  const enviar = form.querySelector('[type="submit"]');
  // Formato estricto (el servidor además comprueba que el dominio reciba correo).
  const FORMATO_EMAIL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;
  const SOLO_LETRAS = /^\p{L}(?:[\p{L}'’ .-]*\p{L})?$/u;
  let pendiente = false;
  let ultimoBoton;
  let overflowAnterior;
  function abrir(event) {
    if (event) event.preventDefault();
    if (dialog.open) return;
    // Sin evento (se abrió desde el cuadro de ingreso): al cerrar, el foco vuelve a "Ingresar".
    ultimoBoton = event ? event.currentTarget : document.querySelector('.nav__ingresar');
    if (!pendiente) {
      form.reset();
      form.hidden = false;
      mensaje.textContent = '';
      mensaje.removeAttribute('data-estado');
    }
    overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    form.elements.nombre.focus();
  }
  // El CTA del hero tenía un listener de pestañas en main.js.
  // Reemplazamos solo ese botón para quitar ese listener y abrir el registro.
  const hero = document.querySelector('.hero__cta [data-goto-tab="publico"]');
  if (hero) {
    const reemplazo = hero.cloneNode(true);
    reemplazo.removeAttribute('data-goto-tab');
    hero.replaceWith(reemplazo);
    reemplazo.addEventListener('click', abrir);
  }
  document.querySelectorAll('.card-publico:not(.card-publico--distribuidor) .link-cta')
    .forEach(boton => boton.addEventListener('click', abrir));
  // Acceso explícito al registro junto a Ingresar. Ingresar se conserva.
  const acciones = document.querySelector('.nav__actions');
  if (acciones) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn--ghost registro-abrir';
    boton.textContent = 'Registrarme';
    boton.addEventListener('click', abrir);
    acciones.prepend(boton);
  }
  window.abrirRegistro = () => abrir();
  dialog.querySelector('.registro-cerrar').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.style.overflow = overflowAnterior;
    ultimoBoton?.focus();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pendiente) return;
    const nombre = form.elements.nombre.value.trim().replace(/\s+/g, ' ');
    const apellido = form.elements.apellido.value.trim().replace(/\s+/g, ' ');
    const dni = form.elements.dni.value.replace(/[.\s]/g, '');
    const cuit = form.elements.cuit.value.replace(/[-.\s]/g, '');
    const email = form.elements.email.value.trim().toLowerCase();
    const emailConfirmacion = form.elements.emailConfirmacion.value.trim().toLowerCase();
    const password = form.elements.password.value;
    mensaje.dataset.estado = 'error';
    if (!SOLO_LETRAS.test(nombre) || nombre.length < 2 || nombre.length > 50) {
      mensaje.textContent = 'Revisá el nombre: usá solo letras (2 a 50 caracteres).';
      form.elements.nombre.focus();
      return;
    }
    if (!SOLO_LETRAS.test(apellido) || apellido.length < 2 || apellido.length > 50) {
      mensaje.textContent = 'Revisá el apellido: usá solo letras (2 a 50 caracteres).';
      form.elements.apellido.focus();
      return;
    }
    if (!/^\d{7,8}$/.test(dni)) {
      mensaje.textContent = 'Ingresá un DNI válido de 7 u 8 números, sin puntos.';
      form.elements.dni.focus();
      return;
    }
    if (cuit && !/^\d{11}$/.test(cuit)) {
      mensaje.textContent = 'El CUIT/CUIL debe tener 11 números (con o sin guiones).';
      form.elements.cuit.focus();
      return;
    }
    if (!FORMATO_EMAIL.test(email) || email.length > 254) {
      mensaje.textContent = 'Ingresá un email válido, por ejemplo nombre@dominio.com.';
      form.elements.email.focus();
      return;
    }
    if (email !== emailConfirmacion) {
      mensaje.textContent = 'Los emails no coinciden. Revisalos e intentá nuevamente.';
      form.elements.emailConfirmacion.focus();
      return;
    }
    if (password !== form.elements.confirmar.value) {
      mensaje.textContent = 'Las contraseñas no coinciden.';
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      mensaje.textContent = 'La contraseña es demasiado larga. Usá una más corta.';
      return;
    }
    pendiente = true;
    enviar.disabled = true;
    enviar.textContent = 'Creando cuenta…';
    mensaje.textContent = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('http://127.0.0.1:3000/api/auth/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, apellido, dni, cuit, email, emailConfirmacion, password }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) {
        mensaje.textContent = data.mensaje || 'No se pudo crear la cuenta. Intentá nuevamente.';
        return;
      }
      form.reset();
      form.hidden = true;
      mensaje.dataset.estado = 'exito';
      mensaje.textContent = '¡Tu cuenta se creó correctamente!';
      if (dialog.open) mensaje.focus();
    } catch (error) {
      mensaje.textContent = error.name === 'AbortError'
        ? 'No recibimos la confirmación a tiempo. Si reintentás y el email ya existe, tu cuenta fue creada.'
        : 'No pudimos comunicarnos con el servicio. Intentá nuevamente en unos momentos.';
    } finally {
      clearTimeout(timeout);
      pendiente = false;
      enviar.disabled = false;
      enviar.textContent = 'Crear cuenta';
    }
  });
})();
