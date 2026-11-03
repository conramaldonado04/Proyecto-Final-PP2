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
      <label for="registroTipo">¿Cómo querés comprar?</label>
      <select id="registroTipo" name="tipoCliente" required>
        <option value="">Elegí tu tipo de cuenta</option>
        <option value="minorista">Minorista · mínimo 1 pack (6 botellas)</option>
        <option value="mayorista">Mayorista · para mi negocio</option>
        <option value="distribuidor">Distribuidor · zona de reparto</option>
      </select>
      <p id="registroTipoAyuda" class="registro-tipo-ayuda" aria-live="polite"></p>
      <label for="registroTelefono">Teléfono de contacto</label>
      <input id="registroTelefono" name="telefono" type="tel" autocomplete="tel" required minlength="6" maxlength="30">
      <fieldset id="registroComercial" hidden>
        <legend>Datos comerciales</legend>
        <label for="registroNegocio">Nombre del negocio / razón social</label>
        <input id="registroNegocio" name="negocio" minlength="2" maxlength="120" disabled>
        <label for="registroDomicilio">Domicilio comercial y localidad</label>
        <input id="registroDomicilio" name="domicilioComercial" minlength="5" maxlength="200" disabled>
      </fieldset>
      <fieldset id="registroDistribucion" hidden>
        <legend>Tu distribución</legend>
        <label for="registroZona">Zona de reparto</label>
        <input id="registroZona" name="zonaDistribucion" minlength="2" maxlength="120" disabled>
        <label for="registroVolumen">Volumen mensual estimado (packs)</label>
        <select id="registroVolumen" name="volumenEstimado" disabled>
          <option value="">Seleccioná un rango</option>
          <option>Hasta 100 packs</option><option>101 a 500 packs</option>
          <option>501 a 2000 packs</option><option>Más de 2000 packs</option>
        </select>
      </fieldset>
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
  let perfilUsuario = null;
  let usuarioSesion = null;
  const cuentaCampos = [...form.querySelectorAll('.modal__form-row, label[for="registroDni"], #registroDni, #registroDatosAyuda, label[for="registroEmail"], #registroEmail, label[for="registroEmailConfirmar"], #registroEmailConfirmar, label[for="registroPassword"], #registroPassword, #registroAyuda, label[for="registroConfirmar"], #registroConfirmar')];
  const textosTipo = {
    minorista: 'Compra mínima: 1 pack de 6 botellas por pedido.',
    mayorista: 'Completá los datos de tu negocio y su CUIT.',
    distribuidor: 'Completá tus datos comerciales, zona de reparto y volumen estimado.'
  };
  function adaptarFormulario() {
    const tipo = form.elements.tipoCliente.value;
    for (const [id, visible] of [['registroComercial', ['mayorista','distribuidor'].includes(tipo)], ['registroDistribucion', tipo === 'distribuidor']]) {
      const grupo = document.getElementById(id);
      grupo.hidden = !visible;
      grupo.querySelectorAll('input, select').forEach(campo => { campo.disabled = !visible; campo.required = visible; });
    }
    form.elements.cuit.required = ['mayorista','distribuidor'].includes(tipo);
    document.querySelector('label[for="registroCuit"] .registro-opcional').textContent = form.elements.cuit.required ? '(obligatorio)' : '(opcional)';
    document.getElementById('registroTipoAyuda').textContent = textosTipo[tipo] || 'Una sola cuenta. Elegí el perfil que corresponde a tus compras.';
  }
  form.elements.tipoCliente.addEventListener('change', adaptarFormulario);
  let ultimoBoton;
  let overflowAnterior;
  function abrir(event, tipo = '', usuario = null) {
    if (event) event.preventDefault();
    if (dialog.open) return;
    // Sin evento (se abrió desde el cuadro de ingreso): al cerrar, el foco vuelve a "Ingresar".
    ultimoBoton = event ? event.currentTarget : document.querySelector('.nav__ingresar');
    if (!pendiente) {
      form.reset();
      form.hidden = false;
      perfilUsuario = usuario;
      cuentaCampos.forEach(elemento => {
        elemento.hidden = Boolean(usuario);
        if (elemento.matches('input')) elemento.disabled = Boolean(usuario);
        elemento.querySelectorAll('input').forEach(campo => { campo.disabled = Boolean(usuario); });
      });
      form.elements.tipoCliente.value = tipo;
      if (usuario) {
        for (const campo of ['telefono','negocio','domicilioComercial','zonaDistribucion','volumenEstimado']) form.elements[campo].value = usuario[campo] || '';
      }
      document.getElementById('registroTitulo').textContent = usuario ? 'Completá tu perfil de compra' : 'Creá tu cuenta';
      dialog.querySelector('.registro-intro').textContent = usuario ? 'Tu cuenta y tus pedidos se conservan. Elegí cómo vas a comprar.' : 'Elegí tu perfil y completá tus datos para crear una sola cuenta.';
      enviar.textContent = usuario ? 'Guardar perfil' : 'Crear cuenta';
      adaptarFormulario();
      mensaje.textContent = '';
      mensaje.removeAttribute('data-estado');
    }
    overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    form.elements.tipoCliente.focus();
  }
  document.querySelectorAll('[data-registro-tipo]').forEach(boton => {
    boton.addEventListener('click', event => abrir(event, boton.dataset.registroTipo));
  });
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
  window.abrirRegistro = (tipo = '') => abrir(null, tipo);
  window.completarPerfilCompra = (usuario) => abrir(null, '', usuario);
  document.getElementById('perfilProductos').onclick = () => activateTab('productos');
  document.getElementById('perfilCompletar').onclick = () => {
    if (usuarioSesion) abrir(null, '', usuarioSesion);
  };
  window.actualizarPerfilComercial = (usuario) => {
    usuarioSesion = usuario;
    document.getElementById('canalesRegistro').hidden = Boolean(usuario);
    document.getElementById('perfilComercial').hidden = !usuario;
    if (!usuario) return;
    const etiquetas = { minorista: 'Minorista', mayorista: 'Mayorista', distribuidor: 'Distribuidor' };
    document.getElementById('perfilSaludo').textContent = `Hola, ${usuario.nombre} · ${usuario.rol === 'admin' ? 'Administrador' : etiquetas[usuario.tipoCliente] || 'Perfil por completar'}`;
    document.getElementById('perfilDescripcion').textContent = usuario.rol === 'admin' ? 'Tu acceso de administrador se conserva en el menú de cuenta.' : usuario.tipoCliente === 'minorista' ? textosTipo.minorista : usuario.tipoCliente ? `${usuario.negocio || 'Tu perfil comercial está registrado'}. ${usuario.tipoCliente === 'distribuidor' ? 'Zona: ' + (usuario.zonaDistribucion || '') : 'Ya podés consultar el catálogo y gestionar tus pedidos.'}` : 'Completá tu perfil una sola vez para continuar comprando.';
    document.getElementById('perfilCompletar').hidden = Boolean(usuario.tipoCliente) || usuario.rol === 'admin';
    const hero = document.querySelector('.hero__cta [data-goto-tab="publico"]');
    if (hero) hero.textContent = 'Ver mi perfil de compra';
  };
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
    if (!form.reportValidity()) return;
    const perfil = Object.fromEntries(['tipoCliente','telefono','negocio','domicilioComercial','zonaDistribucion','volumenEstimado','cuit'].map(campo => [campo, form.elements[campo].disabled ? '' : form.elements[campo].value.trim()]));
    if (perfilUsuario) {
      pendiente = true;
      const campos = [...form.elements].filter(c => c.matches('input, select, button'));
      const deshabilitados = campos.map(c => c.disabled);
      campos.forEach(c => { c.disabled = true; });
      enviar.textContent = 'Guardando…';
      try {
        const response = await fetch('http://127.0.0.1:3000/api/auth/perfil-comercial', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(perfil), signal: AbortSignal.timeout(20000)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.mensaje || 'No se pudo guardar el perfil.');
        dialog.close();
        location.reload();
      } catch (error) {
        mensaje.dataset.estado = 'error';
        mensaje.textContent = error.message || 'No se pudo confirmar el perfil. Recargá antes de reintentar.';
      } finally {
        pendiente = false;
        campos.forEach((c, i) => { c.disabled = deshabilitados[i]; });
        enviar.textContent = 'Guardar perfil';
      }
      return;
    }
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
        body: JSON.stringify({ ...perfil, nombre, apellido, dni, cuit, email, emailConfirmacion, password }),
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
      mensaje.textContent = '¡Tu cuenta se creó correctamente! Iniciá sesión para comprar.';
      const ingresarAhora = document.createElement('button');
      ingresarAhora.type = 'button';
      ingresarAhora.className = 'btn btn--primary';
      ingresarAhora.textContent = 'Iniciar sesión';
      ingresarAhora.onclick = () => {
        dialog.close();
        document.body.style.overflow = overflowAnterior;
        setTimeout(() => window.abrirInicioSesion?.(), 0);
      };
      mensaje.append(document.createElement('br'), ingresarAhora);
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
