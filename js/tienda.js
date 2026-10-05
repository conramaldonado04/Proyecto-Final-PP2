(() => {
  "use strict";
  const API = "http://127.0.0.1:3000/api";
  const moneda = (n) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(n / 100);
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const panel = document.getElementById("productos");
  if (!panel) return;
  let productos = [],
    carrito = {},
    pedidoActual,
    qrUrl,
    cargando = false;
  const aviso = document.createElement("p");
  aviso.className = "tienda-aviso";
  aviso.setAttribute("role", "status");
  document.body.append(aviso);
  const informar = (texto) => {
    aviso.textContent = texto;
  };
  let usuarioCarrito = null;
  let revisionSesion = 0;
  const claveCarrito = (id) => `narampol-carrito-v2-${id}`;
  function recuperarCarrito(id) {
    const resultado = {};
    if (!id) return resultado;
    try {
      const guardado = JSON.parse(
        localStorage.getItem(claveCarrito(id)) || "{}",
      );
      for (const [sku, cantidad] of Object.entries(guardado || {})) {
        if (
          /^[A-Z0-9-]{1,40}$/.test(sku) &&
          Number.isInteger(cantidad) &&
          cantidad > 0 &&
          cantidad <= 100
        )
          resultado[sku] = cantidad;
      }
    } catch {
      informar(
        "No se pudo recuperar el carrito guardado. Podés empezar uno nuevo.",
      );
    }
    return resultado;
  }
  function guardar() {
    try {
      if (usuarioCarrito)
        localStorage.setItem(
          claveCarrito(usuarioCarrito),
          JSON.stringify(carrito),
        );
    } catch {
      informar(
        "El navegador no permite guardar el carrito. Se conservará mientras esta página siga abierta.",
      );
    }
    const cantidad = Object.values(carrito).reduce((a, b) => a + b, 0);
    carritoBtn.setAttribute("aria-label", `Carrito: ${cantidad} paquetes`);
    contador.textContent = String(cantidad);
  }
  async function api(ruta, opciones = {}) {
    const response = await fetch(API + ruta, {
      credentials: "include",
      signal: AbortSignal.timeout(20000),
      ...opciones,
    });
    const data = await response.json();
    if (!response.ok)
      throw Object.assign(
        new Error(data.mensaje || "No se pudo completar la operación."),
        { status: response.status },
      );
    return data;
  }
  const post = (ruta, body) =>
    api(ruta, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  function errorVisible(e) {
    return e.status
      ? e.message
      : "No recibimos respuesta. Comprobá que el servidor esté encendido y revisá Mis pedidos antes de reintentar una compra.";
  }
  function crearDialogo(titulo) {
    const dialog = document.createElement("dialog");

    dialog.className = "tienda-dialog";
    dialog.setAttribute("aria-label", titulo);

    dialog.innerHTML = `
    <button
      class="tienda-cerrar"
      type="button"
      aria-label="Cerrar"
    >✕</button>

    <h2>${esc(titulo)}</h2>

    <div class="tienda-contenido"></div>
  `;

    document.body.append(dialog);

    dialog.querySelector(".tienda-cerrar").onclick = () => {
      dialog.close();
    };

    let foco;

    dialog.abrir = () => {
      if (dialog.open) return;

      foco = document.activeElement;

      dialog.showModal();

      if (typeof window.actualizarBloqueoScroll === "function") {
        window.actualizarBloqueoScroll();
      }
    };

    dialog.addEventListener("close", () => {
      if (typeof window.actualizarBloqueoScroll === "function") {
        window.actualizarBloqueoScroll();
      }

      if (foco?.isConnected) {
        foco.focus();
      }
    });

    return dialog;
  }
  const cartDialog = crearDialogo("Tu carrito");
  const checkoutDialog = crearDialogo("Entrega y confirmación");
  const pedidosDialog = crearDialogo("Mis pedidos");
  const pagoDialog = crearDialogo("Detalle del pedido");
  pagoDialog.addEventListener("close", () => {
    if (qrUrl) URL.revokeObjectURL(qrUrl);
    qrUrl = null;
  });
  const cuerpo = (dialog) => dialog.querySelector(".tienda-contenido");
  const carritoBtn = document.querySelector('[aria-label="Carrito"]');
  if (!carritoBtn) return;
  const contador = document.createElement("span");
  contador.className = "tienda-contador";
  carritoBtn.append(contador);
  const pedidosBtn = document.createElement("button");
  pedidosBtn.type = "button";
  pedidosBtn.className = "btn btn--ghost";
  pedidosBtn.textContent = "Mis pedidos";
  document.querySelector(".nav__actions").append(pedidosBtn);
  const tiendaBtn = document.querySelector(".nav__soon");
  if (tiendaBtn) {
    const boton = document.createElement("button");
    boton.className = "tienda-nav";
    boton.textContent = "Tienda";
    boton.onclick = () => {
      if (typeof activateTab === "function") activateTab("productos");
    };
    tiendaBtn.replaceWith(boton);
  }
  panel.innerHTML = `
    <div class="tienda-layout">
    <div class="tienda-cabecera"><div><p class="eyebrow">Naranpol · Por paquete</p><h2 class="section-title">Elegí tus sabores</h2>
    <p>Paquetes para tu casa o tu comercio.</p></div><span class="tienda-etiqueta">Catálogo ficticio · TP</span></div>
    <p class="tienda-nota">Precios y stock de ejemplo. Envío ficticio: $2.500; gratis desde $50.000. Los jugos no tienen cobro habilitado.</p>
    <div class="tienda-filtros"><label>Buscar<input id="tiendaBuscar" type="search" placeholder="Naranja o pomelo…"></label>
    <label>Sabor<select id="tiendaSabor"><option value="">Todos</option></select></label><button type="button" id="tiendaActualizar" class="btn btn--ghost">Actualizar</button></div>
    <p id="tiendaEstado" role="status">Cargando productos…</p><div class="tienda-grid"></div></div>`;
  const estado = panel.querySelector("#tiendaEstado");
  const buscar = panel.querySelector("#tiendaBuscar"),
    sabor = panel.querySelector("#tiendaSabor");

  // Sólo estas dos presentaciones tienen botella y compra en el catálogo actual.
  const tarjetas3D = {
    'JUG-NAR-1500-6': { modelo: 'models/naranpol_naranja.glb', descripcion: 'Jugo de naranja Naranpol. Agua saborizada sabor naranja en botella de 1,5 litros. Paquete de 6 botellas.' },
    'JUG-POM-1500-6': { modelo: 'models/naranpol_pomelo.glb', descripcion: 'Jugo de pomelo Naranpol. Agua saborizada sabor pomelo en botella de 1,5 litros. Paquete de 6 botellas.' },
  };
  // Se muestran los productos con botella 3D y los cargados desde el panel admin con imagen.
  const seMuestra = (p) => Boolean(tarjetas3D[p.sku] || p.imagen);
  // Stock bajo = 20 % o menos del stock ideal que definió el administrador.
  const quedanPocos = (p) => p.stock > 0 && p.stockReferencia > 0 && p.stock * 100 <= p.stockReferencia * 20;
  const textoStock = (p) =>
    p.stock < 1 ? "Sin stock"
      : quedanPocos(p) ? `<span class="tienda-pocos">¡Últimos ${esc(p.stock)} paquetes!</span>`
      : esc(p.stock) + " paquetes disponibles";
  function tarjetaConImagen(p) {
    return `
      <article class="tienda-card tienda-card-foto">
        <img class="tienda-foto" src="${esc(p.imagen)}" alt="${esc(p.nombre)} · ${esc(p.presentacion)}" loading="lazy">
        <div class="tienda-card-marca"><span>${esc(p.unidades)} UNIDADES · ${esc(p.sabor || "")}</span></div>
        <h3>${esc(p.nombre)}</h3>
        <p class="tienda-card-descripcion">${esc(p.presentacion)}</p>
        <strong class="tienda-precio">${moneda(p.precioCentavos)}</strong><small>Por paquete · precio ficticio</small>
        <p class="tienda-stock">${textoStock(p)}</p>
        <button class="btn btn--primary" data-agregar="${esc(p.sku)}" ${p.stock < 1 ? "disabled" : ""}>Agregar al carrito</button>
      </article>`;
  }
  function dibujarCatalogo() {
    const texto = buscar.value.trim().toLowerCase();
    const lista = productos.filter(
      (p) =>
        seMuestra(p) && (!sabor.value || p.sabor === sabor.value) &&
        `${p.nombre} ${p.presentacion}`.toLowerCase().includes(texto),
    );
    panel.querySelector(".tienda-grid").innerHTML = lista
      .map(
        (p) => !tarjetas3D[p.sku] ? tarjetaConImagen(p) : `
      <article class="tienda-card tienda-card-botella">
        <div class="producto-3d" data-modelo="${tarjetas3D[p.sku].modelo}" data-sabor="${esc(p.sabor)}" aria-label="Botella movible de ${esc(p.nombre)}"></div>
        <p class="tienda-card-ayuda">Arrastrá la botella para girarla e inclinarla.</p>
        <div class="tienda-card-marca"><span>${esc(p.unidades)} BOTELLAS · 1,5 L</span></div>
        <h3>${esc(p.nombre)}</h3>
        <p class="tienda-card-descripcion">${tarjetas3D[p.sku].descripcion}</p>
        <strong class="tienda-precio">${moneda(p.precioCentavos)}</strong><small>Por paquete · precio ficticio</small>
        <p class="tienda-stock">${textoStock(p)}</p>
        <button class="btn btn--primary" data-agregar="${esc(p.sku)}" ${p.stock < 1 ? "disabled" : ""}>Agregar al carrito</button>
      </article>`,
      )
      .join("");
    window.Naranpol3D?.montarTodos();

    window.dispatchEvent(new CustomEvent("naranpol:catalogo-renderizado"));
    estado.textContent = lista.length
      ? ""
      : productos.some(seMuestra) ? "No encontramos productos con esa búsqueda." : "Faltan las nuevas presentaciones. Reiniciá el backend actualizado y presioná Actualizar.";
  }
  async function cargarCatalogo() {
    if (cargando) return;
    cargando = true;
    estado.textContent = "Actualizando catálogo…";
    try {
      const data = await api("/tienda/productos");
      productos = data.productos;
      const actual = sabor.value;
      sabor.innerHTML =
        '<option value="">Todos</option>' +
        [...new Set(productos.filter(seMuestra).map((p) => p.sabor))]
          .map((s) => `<option>${esc(s)}</option>`)
          .join("");
      sabor.value = actual;
      dibujarCatalogo();
    } catch (e) {
      estado.textContent = errorVisible(e);
    } finally {
      cargando = false;
    }
  }
  buscar.oninput = dibujarCatalogo;
  sabor.onchange = dibujarCatalogo;
  panel.querySelector("#tiendaActualizar").onclick = cargarCatalogo;
  panel.addEventListener("click", async (e) => {
    const boton = e.target.closest("[data-agregar]");
    if (!boton) return;
    if (!(await exigirSesion())) return;
    const p = productos.find((p) => p.sku === boton.dataset.agregar);
    if (!p) return;
    if (
      (p.pruebaPago && Object.keys(carrito).some((s) => s !== p.sku)) ||
      (!p.pruebaPago && carrito["TP-PAGO-200"])
    ) {
      informar(
        "La prueba real de $200 se compra sola. Quitá los otros productos del carrito primero.",
      );
      return;
    }
    const max = p.pruebaPago ? 1 : Math.min(100, p.stock);
    if ((carrito[p.sku] || 0) >= max) {
      informar("Ya alcanzaste la cantidad disponible para este producto.");
      return;
    }
    carrito[p.sku] = (carrito[p.sku] || 0) + 1;
    guardar();
    informar(`${p.nombre}: agregado al carrito.`);
  });
  function resumen() {
    const items = Object.entries(carrito).map(([sku, cantidad]) => ({
      producto: productos.find((p) => p.sku === sku),
      sku,
      cantidad,
    }));
    const subtotal = items.reduce(
      (n, i) => n + (i.producto?.precioCentavos || 0) * i.cantidad,
      0,
    );
    const prueba = items.length === 1 && items[0].sku === "TP-PAGO-200";
    const envio = prueba || subtotal >= 5000000 || !items.length ? 0 : 250000;
    return { items, subtotal, envio, total: subtotal + envio, prueba };
  }
  function dibujarCarrito() {
    const r = resumen();
    cuerpo(cartDialog).innerHTML = r.items.length
      ? `<div class="tienda-lineas">${r.items
          .map(
            (i) => `
      <div class="tienda-linea"><div><strong>${esc(i.producto?.nombre || i.sku)}</strong><p>${esc(i.producto?.presentacion || "Producto no disponible")}</p><span>${moneda((i.producto?.precioCentavos || 0) * i.cantidad)}</span></div>
      <label>Paquetes<input type="number" data-cantidad="${esc(i.sku)}" min="1" max="${i.producto?.pruebaPago ? 1 : Math.min(100, i.producto?.stock || 1)}" value="${i.cantidad}"></label>
      <button type="button" data-quitar="${esc(i.sku)}" class="tienda-link">Quitar</button></div>`,
          )
          .join("")}</div>
      <div class="tienda-totales"><p>Productos <strong>${moneda(r.subtotal)}</strong></p><p>Envío ${r.prueba ? "(sin entrega)" : "ficticio"} <strong>${moneda(r.envio)}</strong></p><p>Total estimado <strong>${moneda(r.total)}</strong></p></div>
      <p class="tienda-nota">${r.prueba ? "Prueba real de $200 a la cuenta del vendedor. No incluye productos ni envío." : "Este pedido es ficticio y no habilita ningún cobro."}</p>
      <button type="button" class="btn btn--primary" id="tiendaContinuar">Continuar</button>`
      : "<p>Tu carrito está vacío. Elegí un paquete del catálogo.</p>";
    const continuar = cuerpo(cartDialog).querySelector("#tiendaContinuar");
    if (continuar) continuar.onclick = abrirCheckout;
  }
  carritoBtn.onclick = async () => {
    if (!(await exigirSesion())) return;
    await cargarCatalogo();
    if (!usuarioCarrito) return;
    dibujarCarrito();
    cartDialog.abrir();
  };
  cartDialog.addEventListener("click", (e) => {
    const b = e.target.closest("[data-quitar]");
    if (b) {
      delete carrito[b.dataset.quitar];
      guardar();
      dibujarCarrito();
    }
  });
  cartDialog.addEventListener("change", (e) => {
    const sku = e.target.dataset.cantidad;
    if (!sku) return;
    const p = productos.find((p) => p.sku === sku),
      n = Number(e.target.value);
    if (
      !p ||
      !Number.isInteger(n) ||
      n < 1 ||
      n > Math.min(100, p.stock) ||
      (p.pruebaPago && n !== 1)
    ) {
      informar("Cantidad inválida o superior al stock.");
      dibujarCarrito();
      return;
    }
    carrito[sku] = n;
    guardar();
    dibujarCarrito();
  });
  async function abrirCheckout() {
    try {
      const { usuario } = await api("/auth/sesion");
      if (usuario.id !== usuarioCarrito) {
        await revisarAdmin();
        informar("La cuenta cambió. Revisá su carrito antes de continuar.");
        return;
      }
      const r = resumen();
      if (
        !r.items.length ||
        r.items.some((i) => !i.producto || i.cantidad > i.producto.stock)
      ) {
        informar("Actualizá el carrito: hay productos sin stock.");
        return;
      }
      cartDialog.close();
      const campos = [
        ["nombre", "Nombre y apellido", "text"],
        ["telefono", "Teléfono", "tel"],
        ["calle", "Calle", "text"],
        ["numero", "Altura", "text"],
        ["localidad", "Localidad", "text"],
        ["codigoPostal", "Código postal", "text"],
      ];
      cuerpo(checkoutDialog).innerHTML =
        `<p>Cuenta: ${esc(usuario.email)}</p><form class="tienda-form">
        ${r.prueba ? '<p class="tienda-nota">Prueba real de $200. No incluye mercadería ni entrega.</p>' : `<p>Entrega ficticia en 24–48 horas hábiles. Ingresá datos de prueba.</p><div class="tienda-campos">${campos.map(([name, label, type]) => `<label>${label}<input name="${name}" type="${type}" required maxlength="${name === "referencia" ? 200 : 100}" value="${name === "nombre" ? esc(usuario.nombre) : name === "localidad" ? "Santa Fe" : ""}"></label>`).join("")}</div><label>Referencia (opcional)<input name="referencia" maxlength="200"></label>`}
        <p class="tienda-precio">Total: ${moneda(r.total)}</p><p>El importe final y el stock se verifican al crear el pedido.</p>
        <button class="btn btn--primary" type="submit">${r.prueba ? "Crear prueba de $200" : "Crear pedido ficticio"}</button><p role="status" class="tienda-error"></p></form>`;
      const form = cuerpo(checkoutDialog).querySelector("form");
      let ocupado = false;
      form.onsubmit = async (event) => {
        event.preventDefault();
        if (ocupado) return;
        const boton = form.querySelector("[type=submit]"),
          error = form.querySelector(".tienda-error");
        const storageKey = `narampol-intento-${usuario.id}`;
        let clave;
        try {
          clave = sessionStorage.getItem(storageKey) || crypto.randomUUID();
          sessionStorage.setItem(storageKey, clave);
        } catch {
          error.textContent =
            "Habilitá el almacenamiento de esta pestaña para evitar pedidos duplicados.";
          return;
        }
        ocupado = true;
        boton.disabled = true;
        error.textContent = "Creando pedido…";
        try {
          const actual = await api("/auth/sesion");
          if (
            actual.usuario.id !== usuario.id ||
            usuarioCarrito !== usuario.id
          ) {
            await revisarAdmin();
            throw new Error("La cuenta cambió. Volvé a abrir el carrito.");
          }
          const data = await post("/tienda/pedidos", {
            clave,
            items: r.items.map((i) => ({ sku: i.sku, cantidad: i.cantidad })),
            entrega: Object.fromEntries(new FormData(form)),
          });
          sessionStorage.removeItem(storageKey);
          localStorage.removeItem(claveCarrito(usuario.id));
          if (usuarioCarrito !== usuario.id) return;
          carrito = {};
          guardar();
          checkoutDialog.close();
          await verPedido(data.pedido);
          await cargarCatalogo();
        } catch (e) {
          // En un timeout conservamos la clave para que repetir no descuente stock dos veces.
          if (e.status && e.status < 500) sessionStorage.removeItem(storageKey);
          error.textContent = errorVisible(e);
        } finally {
          ocupado = false;
          boton.disabled = false;
        }
      };
      checkoutDialog.abrir();
    } catch (e) {
      informar(errorVisible(e));
    }
  }
  const estadoPago = (p) =>
    p.estado === "cancelado"
      ? "Cancelado · stock repuesto"
      : {
          pendiente: "Pendiente de pago",
          en_revision: "Pago informado · falta revisión",
          pagado: "Pago verificado por el vendedor",
        }[p.pago] || p.pago;
  const puedeCancelar = (p) =>
    p.estado === "pendiente_pago" && p.pago === "pendiente";
  async function cancelarDesdePantalla(pedido, boton, destino, refrescar) {
    if (boton.disabled) return;
    const pregunta = pedido.pruebaPago
      ? "¿Cancelar esta prueba? Si ya transferiste dinero, no la canceles: informá el pago. Si no pagaste, podés continuar."
      : "¿Cancelar este pedido? Los paquetes volverán al stock y el pedido quedará en el historial como Cancelado.";
    if (!window.confirm(pregunta)) return;
    boton.disabled = true;
    destino.textContent = "Cancelando pedido…";
    try {
      const data = await post(`/tienda/pedidos/${pedido.id}/cancelar`, {});
      await refrescar(data.pedido);
      await cargarCatalogo();
    } catch (error) {
      destino.textContent = error.status
        ? error.message
        : "No recibimos confirmación. Actualizá Mis pedidos para comprobar el estado. Reintentar la cancelación no repone stock dos veces.";
    } finally {
      boton.disabled = false;
    }
  }
  async function verPedido(pedido, vistaAdmin = false) {
    pedidoActual = pedido;
    const id = pedido.id;
    if (qrUrl) URL.revokeObjectURL(qrUrl);
    qrUrl = null;
    cuerpo(pagoDialog).innerHTML =
      `<p class="tienda-etiqueta">${pedido.pruebaPago ? "Prueba real de $200 · sin entrega" : "Pedido ficticio · sin cobro"}</p>
      <p>Pedido <strong>${esc(id)}</strong></p><p>${esc(estadoPago(pedido))}</p>
      ${pedido.items.map((i) => `<p>${esc(i.cantidad)} × ${esc(i.nombre)} · ${esc(i.presentacion)}</p>`).join("")}
      <p class="tienda-precio">Total: ${moneda(pedido.totalCentavos)}</p>
      ${pedido.pruebaPago ? "" : `<p>Entrega: ${esc(pedido.entrega.calle)} ${esc(pedido.entrega.numero)}, ${esc(pedido.entrega.localidad)}.</p>`}
      ${pedido.estado === "cancelado" ? "<p>Este pedido fue cancelado. Los paquetes ya volvieron al stock.</p>" : ""}
      ${!vistaAdmin && puedeCancelar(pedido) ? '<button type="button" class="btn btn--ghost" data-cancelar-detalle>Cancelar pedido</button>' : ""}
      <p role="status" class="tienda-error" data-estado-cancelacion></p>
      <div class="tienda-pago"></div>`;
    pagoDialog.abrir();
    const botonCancelar = cuerpo(pagoDialog).querySelector(
      "[data-cancelar-detalle]",
    );
    if (botonCancelar)
      botonCancelar.onclick = () =>
        cancelarDesdePantalla(
          pedido,
          botonCancelar,
          cuerpo(pagoDialog).querySelector("[data-estado-cancelacion]"),
          (actualizado) => verPedido(actualizado),
        );
    const zona = cuerpo(pagoDialog).querySelector(".tienda-pago");
    if (
      vistaAdmin ||
      !pedido.pruebaPago ||
      pedido.pago !== "pendiente" ||
      pedido.estado === "cancelado"
    )
      return;
    zona.innerHTML = "<p>Mostrando QR de Mercado Pago…</p>";
    try {
      const response = await fetch(`${API}/tienda/pedidos/${id}/qr`, {
        credentials: "include",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.mensaje);
      }
      const blob = await response.blob();
      if (pedidoActual?.id !== id || !pagoDialog.open) return;
      qrUrl = URL.createObjectURL(blob);
      zona.innerHTML = `<p>Escaneá este QR desde Mercado Pago en otro dispositivo. Si la app pide un importe, ingresá <strong>$200</strong>. Revisá el destinatario antes de confirmar.</p>
        <img class="tienda-qr" alt="QR de cobro de la cuenta del vendedor">
        <p>No pagues un importe distinto. Este QR no confirma el pago en la web automáticamente.</p>
        <form class="tienda-form"><label>Número de operación<input name="referencia" required minlength="3" maxlength="100"></label><button class="btn btn--primary">Ya pagué: informar operación</button><p role="status"></p></form>`;
      zona.querySelector("img").src = qrUrl;
      const form = zona.querySelector("form");
      form.onsubmit = async (e) => {
        e.preventDefault();
        const b = form.querySelector("button");
        if (b.disabled) return;
        b.disabled = true;
        try {
          const data = await post(`/tienda/pedidos/${id}/informar-pago`, {
            referencia: form.elements.referencia.value,
          });
          await verPedido(data.pedido);
        } catch (error) {
          form.querySelector("[role=status]").textContent = errorVisible(error);
        } finally {
          b.disabled = false;
        }
      };
    } catch (e) {
      zona.textContent = e.message || "No se pudo mostrar el QR.";
    }
  }
  async function mostrarPedidos(admin = false) {
    if (!(await exigirSesion())) return;
    const propietario = usuarioCarrito;
    cuerpo(pedidosDialog).textContent = "Cargando pedidos…";
    pedidosDialog.abrir();
    try {
      const data = await api(
        admin ? "/tienda/admin/pedidos" : "/tienda/pedidos",
      );
      if (propietario !== usuarioCarrito) return;
      cuerpo(pedidosDialog).innerHTML =
        `<p>${admin ? "Administración: últimos 100 pedidos. Confirmá pagos solo después de verificar el ingreso en Mercado Pago." : "Tus últimos 100 pedidos."}</p>` +
        (data.pedidos.length
          ? data.pedidos
              .map(
                (p) =>
                  `<article class="tienda-pedido"><strong>${esc(p.id.slice(-8).toUpperCase())} · ${moneda(p.totalCentavos)}</strong><p>${new Date(p.createdAt).toLocaleString("es-AR")} · ${esc(estadoPago(p))}</p><p>${p.pruebaPago ? "Prueba real sin mercadería" : "Pedido ficticio con entrega"}</p><button class="btn btn--ghost" data-ver="${esc(p.id)}">Ver detalle</button>${!admin && puedeCancelar(p) ? `<button type="button" class="btn btn--ghost" data-cancelar="${esc(p.id)}">Cancelar pedido</button>` : ""}<p role="status" class="tienda-error" data-estado-cancelacion></p>${admin && p.pago === "en_revision" && p.estado !== "cancelado" ? `<p>Operación informada: ${esc(p.referenciaPago)}</p><button class="btn btn--primary" data-confirmar="${esc(p.id)}">Confirmar ingreso verificado</button>` : ""}</article>`,
              )
              .join("")
          : "<p>Todavía no hay pedidos.</p>");
      cuerpo(pedidosDialog).onclick = async (e) => {
        const ver = e.target.closest("[data-ver]"),
          confirmar = e.target.closest("[data-confirmar]"),
          cancelar = e.target.closest("[data-cancelar]");
        if (ver) {
          pedidosDialog.close();
          await verPedido(
            data.pedidos.find((p) => p.id === ver.dataset.ver),
            admin,
          );
        }
        if (cancelar) {
          const pedido = data.pedidos.find(
            (p) => p.id === cancelar.dataset.cancelar,
          );
          await cancelarDesdePantalla(
            pedido,
            cancelar,
            cancelar
              .closest("article")
              .querySelector("[data-estado-cancelacion]"),
            () => mostrarPedidos(admin),
          );
        }
        if (
          confirmar &&
          window.confirm(
            "¿Verificaste en tu cuenta de Mercado Pago un ingreso de $200 correspondiente a esta operación, sin haberlo asignado a otro pedido?",
          )
        ) {
          confirmar.disabled = true;
          try {
            await post(
              `/tienda/admin/pedidos/${confirmar.dataset.confirmar}/confirmar-pago`,
              { verificadoEnMercadoPago: true },
            );
            await mostrarPedidos(true);
          } catch (error) {
            informar(errorVisible(error));
            confirmar.disabled = false;
          }
        }
      };
    } catch (e) {
      cuerpo(pedidosDialog).textContent = errorVisible(e);
    }
  }
  pedidosBtn.onclick = () => mostrarPedidos(false);
  const adminBtn = document.createElement("button");
  adminBtn.className = "btn btn--ghost";
  adminBtn.textContent = "Panel de administración";
  adminBtn.type = "button";
  adminBtn.onclick = () => (location.href = "admin.html");
  // Se verifica el rol en el servidor incluso si alguien fuerza este botón.
  function cambiarUsuario(usuario) {
    const id = usuario?.id || null;
    if (id !== usuarioCarrito) {
      // Lo que se guardó con otra cuenta permanece bajo su propia clave.
      usuarioCarrito = id;
      carrito = recuperarCarrito(id);
      for (const dialog of [
        cartDialog,
        checkoutDialog,
        pedidosDialog,
        pagoDialog,
      ]) {
        if (dialog.open) dialog.close();
        cuerpo(dialog).replaceChildren();
      }
      pedidoActual = null;
      informar("");
    }
    pedidosBtn.hidden = !id;
    if (usuario?.rol === "admin") {
      if (!adminBtn.isConnected)
        document.querySelector(".nav__actions").append(adminBtn);
    } else adminBtn.remove();
    guardar();
  }
  async function revisarAdmin() {
    const revision = ++revisionSesion;
    try {
      const { usuario } = await api("/auth/sesion");
      if (revision !== revisionSesion) return false;
      cambiarUsuario(usuario);
      return Boolean(usuarioCarrito);
    } catch {
      if (revision === revisionSesion) cambiarUsuario(null);
      return false;
    }
  }
  async function exigirSesion() {
    if (await revisarAdmin()) return true;
    informar(
      "Ingresá a tu cuenta para usar tu carrito. Si ya ingresaste, comprobá la conexión con el servidor.",
    );
    return false;
  }
  // Compatibilidad con login.js existente: observar solo respuestas exitosas
  // de login/logout, sin leer contraseñas ni cambiar sus solicitudes.
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async function (input, opciones) {
    const response = await fetchOriginal(input, opciones);
    const url = new URL(
      typeof input === "string" ? input : input.url || String(input),
      location.href,
    );
    const method = (opciones?.method || input?.method || "GET").toUpperCase();
    if (
      method === "POST" &&
      response.ok &&
      [API + "/auth/login", API + "/auth/logout"].includes(url.href)
    ) {
      ++revisionSesion;
      cambiarUsuario(null);
      try {
        localStorage.setItem(
          "narampol-sesion-cambio",
          String(Date.now()) + Math.random(),
        );
      } catch {}
      if (url.pathname.endsWith("/login")) await revisarAdmin();
    }
    return response;
  };
  window.addEventListener("storage", async (e) => {
    if (e.key === "narampol-sesion-cambio") {
      ++revisionSesion;
      cambiarUsuario(null);
      await revisarAdmin();
    } else if (usuarioCarrito && e.key === claveCarrito(usuarioCarrito)) {
      carrito = recuperarCarrito(usuarioCarrito);
      contador.textContent = String(
        Object.values(carrito).reduce((a, b) => a + b, 0),
      );
      if (cartDialog.open) dibujarCarrito();
      if (checkoutDialog.open) {
        checkoutDialog.close();
        informar(
          "El carrito cambió en otra pestaña. Revisalo antes de continuar.",
        );
      }
    }
  });
  window.addEventListener("focus", revisarAdmin);
  guardar();
  cargarCatalogo();
  revisarAdmin();
})();
