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
      <label for="registroNombre">Nombre y apellido</label>
      <input id="registroNombre" name="nombre" autocomplete="name" required minlength="2" maxlength="100">
      <label for="registroEmail">Email</label>
      <input id="registroEmail" name="email" type="email" autocomplete="email" required maxlength="254">
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
  let pendiente = false;
  let ultimoBoton;
  let overflowAnterior;
  function abrir(event) {
    event.preventDefault();
    if (dialog.open) return;
    ultimoBoton = event.currentTarget;
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
    const nombre = form.elements.nombre.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;
    mensaje.dataset.estado = 'error';
    if (nombre.length < 2) {
      mensaje.textContent = 'Ingresá un nombre de al menos 2 caracteres.';
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
        body: JSON.stringify({ nombre, email, password }),
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
