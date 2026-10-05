// Panel de administración de Naranpol.
// Habla con el backend en http://127.0.0.1:3000 usando la misma cookie de sesión que la tienda.
(() => {
  "use strict";
  const API = "http://127.0.0.1:3000/api";
  const LOGO = "images/logo-naranpol.png";
  const REVISAR_CADA_MS = 60_000; // cada cuánto se revisa si algún producto entró en stock bajo

  // ───────── utilidades ─────────
  const $ = (s, raiz = document) => raiz.querySelector(s);
  const moneda = (c) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format((c || 0) / 100);
  const numero = (n) => new Intl.NumberFormat("es-AR").format(n);
  const fecha = (f) =>
    f ? new Date(f).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "—";
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const corto = (id) => String(id).slice(-8).toUpperCase();
  const img = (ruta) => esc(ruta || LOGO);

  const ESTADOS = {
    pendiente_pago: ["Pendiente de pago", "warn"],
    preparando: ["Preparando", "info"],
    enviado: ["Enviado", "info"],
    entregado: ["Entregado", "ok"],
    cancelado: ["Cancelado", "gris"],
  };
  const PAGOS = { pendiente: ["Pendiente", "warn"], en_revision: ["En revisión", "bad"], pagado: ["Pagado", "ok"] };
  const TIPOS_MOV = {
    alta: "Alta", ingreso: "Ingreso", egreso: "Egreso", ajuste: "Ajuste (conteo)", cancelacion_pedido: "Cancelación de pedido",
  };
  const SIGUIENTE = { pendiente_pago: "preparando", preparando: "enviado", enviado: "entregado" };
  const chip = ([texto, tono]) => `<span class="chip chip--${tono}">${esc(texto)}</span>`;

  async function api(ruta, opciones = {}) {
    const init = { credentials: "include", signal: AbortSignal.timeout(20000), ...opciones };
    if (opciones.body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(opciones.body);
    }
    let response;
    try {
      response = await fetch(API + ruta, init);
    } catch {
      throw Object.assign(new Error("No hay respuesta del servidor. Revisá que esté corriendo `node server.js` en la carpeta backend."), { status: 0 });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(data.mensaje || `Error ${response.status}.`), { status: response.status, campos: data.campos });
    }
    return data;
  }

  let toastTimer;
  function aviso(texto, tipo = "") {
    const t = $("#admToast");
    t.textContent = texto;
    t.className = `adm-toast visible ${tipo ? "adm-toast--" + tipo : ""}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("visible"), tipo === "alerta" ? 7000 : 3500);
  }

  const dialog = $("#admDialog");
  const cuerpo = $("#admDialogCuerpo");
  dialog.querySelector("[data-cerrar]").onclick = () => dialog.close();
  function abrirDialogo(html, clase = "") {
    cuerpo.innerHTML = html;
    dialog.className = "adm-dialog " + clase;
    if (!dialog.open) dialog.showModal();
  }

  async function accion(boton, fn, destinoError) {
    if (boton) boton.disabled = true;
    try {
      await fn();
    } catch (e) {
      if (e.status === 401 || e.status === 403) return mostrarAcceso(e.message);
      if (destinoError) destinoError.textContent = e.message;
      else aviso(e.message, "error");
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  // ───────── errores por campo ─────────
  // Cada campo es un <div class="adm-campo-form" data-campo="nombre"> con su <p class="adm-msg-campo">.
  function limpiarErrores(form) {
    form.querySelectorAll(".adm-campo-form.con-error").forEach((c) => c.classList.remove("con-error"));
    form.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
    form.querySelectorAll(".adm-msg-campo").forEach((m) => (m.textContent = ""));
    const general = $(".adm-error", form);
    if (general) general.textContent = "";
  }
  function marcarErrores(form, errores) {
    let primero = null;
    for (const [campo, mensaje] of Object.entries(errores)) {
      const caja = form.querySelector(`[data-campo="${campo}"]`);
      if (!caja) continue;
      caja.classList.add("con-error");
      const msg = $(".adm-msg-campo", caja);
      if (msg) msg.textContent = mensaje;
      const input = caja.querySelector('input:not([type="hidden"]), select, textarea, [tabindex]');
      if (input) input.setAttribute("aria-invalid", "true");
      primero ??= input;
    }
    const cantidad = Object.keys(errores).length;
    const general = $(".adm-error", form);
    if (general && cantidad) {
      general.textContent = cantidad === 1 ? "Hay 1 campo para corregir." : `Hay ${cantidad} campos para corregir.`;
    }
    primero?.focus();
    return cantidad === 0;
  }
  // Muestra un error del servidor: si trae `campos`, marca cada uno; si no, el mensaje general.
  function errorDeServidor(form, e) {
    if (e.status === 401 || e.status === 403) return mostrarAcceso(e.message);
    if (e.campos && Object.keys(e.campos).length) return marcarErrores(form, e.campos);
    $(".adm-error", form).textContent = e.message;
  }
  // Al corregir un campo se borra su error.
  function borrarErrorAlEscribir(form) {
    form.addEventListener("input", (ev) => {
      const caja = ev.target.closest(".adm-campo-form");
      if (!caja?.classList.contains("con-error")) return;
      caja.classList.remove("con-error");
      ev.target.removeAttribute("aria-invalid");
      $(".adm-msg-campo", caja).textContent = "";
    });
  }
  const campo = (nombre, etiqueta, control, ayuda = "") => `
    <div class="adm-campo-form" data-campo="${nombre}">
      <label for="f-${nombre}">${etiqueta}</label>
      ${control}
      ${ayuda ? `<span class="adm-ayuda">${ayuda}</span>` : ""}
      <p class="adm-msg-campo" id="f-${nombre}-error"></p>
    </div>`;

  // Acepta "7200", "7.200", "7.200,50", "7200.50" o "$ 7.200". Devuelve centavos o un mensaje de error.
  function leerPesos(texto) {
    let t = String(texto).replace(/\$|\s/g, "");
    if (!t) return { error: "Completá el precio." };
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return { error: "Escribí el precio en números, con hasta 2 decimales. Ej.: 7200 o 7.200,50" };
    const centavos = Math.round(Number(t) * 100);
    if (centavos <= 0) return { error: "El precio tiene que ser mayor a $0." };
    if (centavos > 10_000_000_000) return { error: "El precio no puede superar $100.000.000." };
    return { centavos };
  }
  const leerEntero = (texto) => (String(texto).trim() === "" ? undefined : Number(String(texto).trim()));

  // ───────── sesión ─────────
  let usuarioActual = null;
  function mostrarAcceso(mensaje = "") {
    if (dialog.open) dialog.close();
    detenerRevision();
    $("#admPanel").hidden = true;
    $("#admSesion").hidden = true;
    $("#admAcceso").hidden = false;
    $("#admLoginError").textContent = mensaje;
  }

  async function iniciar() {
    try {
      const { usuario } = await api("/auth/sesion");
      if (usuario.rol !== "admin") {
        return mostrarAcceso(`La cuenta ${usuario.email} no es administradora. Cerrá sesión en la tienda e ingresá con la cuenta admin.`);
      }
      usuarioActual = usuario;
      $("#admUsuario").textContent = usuario.nombre;
      $("#admAvatar").textContent = (usuario.nombre || "A").trim().charAt(0).toUpperCase();
      $("#saludo").textContent = `Hola, ${usuario.nombre.split(" ")[0]}`;
      $("#saludoFecha").textContent = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
      $("#admAcceso").hidden = true;
      $("#admSesion").hidden = false;
      $("#admPanel").hidden = false;
      irA(location.hash.slice(1) || "resumen");
      iniciarRevision();
    } catch (e) {
      mostrarAcceso(e.status === 401 ? "" : e.message);
    }
  }

  const formLogin = $("#admLogin");
  borrarErrorAlEscribir(formLogin);
  formLogin.onsubmit = (e) => {
    e.preventDefault();
    limpiarErrores(formLogin);
    const email = formLogin.email.value.trim();
    const password = formLogin.password.value;
    const errores = {};
    if (!email) errores.email = "Completá el email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.email = "El email no tiene un formato válido (ej.: nombre@dominio.com).";
    if (!password) errores.password = "Completá la contraseña.";
    if (!marcarErrores(formLogin, errores)) return;
    accion(formLogin.querySelector("button"), async () => {
      await api("/auth/login", { method: "POST", body: { email, password } });
      formLogin.password.value = "";
      await iniciar();
    }, $("#admLoginError"));
  };

  $("#admSalir").onclick = () =>
    accion(null, async () => {
      await api("/auth/logout", { method: "POST", body: {} });
      mostrarAcceso("Sesión cerrada.");
    });

  // ───────── pestañas ─────────
  const cargadores = { resumen: cargarResumen, stock: cargarStock, pedidos: cargarPedidos, movimientos: cargarMovimientos };
  let pestañaActual = "resumen";
  function irA(tab) {
    if (!cargadores[tab]) tab = "resumen";
    pestañaActual = tab;
    document.querySelectorAll(".adm-tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    document.querySelectorAll(".adm-seccion").forEach((s) => (s.hidden = s.dataset.seccion !== tab));
    history.replaceState(null, "", "#" + tab);
    accion(null, cargadores[tab]);
  }
  document.querySelectorAll(".adm-tabs [role=tab]").forEach((b) => (b.onclick = () => irA(b.dataset.tab)));

  // ───────── ALERTA DE STOCK BAJO (≤ 20 % del stock ideal) ─────────
  let bajosConocidos = null; // SKUs en alerta la última vez que se revisó
  let porcentajeAlerta = 20;
  let timerRevision;

  function pintarAlerta(bajos) {
    const caja = $("#alertaStock");
    const badge = $("#badgeStock");
    badge.hidden = !bajos.length;
    badge.textContent = bajos.length;
    if (!bajos.length) return (caja.hidden = true);
    const permiso = "Notification" in window ? Notification.permission : "denied";
    caja.hidden = false;
    caja.innerHTML = `
      <div class="adm-alerta-titulo">
        <span class="adm-alerta-icono" aria-hidden="true">!</span>
        <div><strong>Stock bajo en ${bajos.length} producto${bajos.length === 1 ? "" : "s"}</strong>
        <span>Quedan ${porcentajeAlerta} % o menos del stock ideal. Reponé antes de quedarte sin mercadería.</span></div>
        ${permiso === "default" ? '<button type="button" class="btn btn--ghost btn--chico" data-notif>Avisarme también en el navegador</button>' : ""}
      </div>
      <ul class="adm-alerta-lista">${bajos.map((p) => `
        <li><img src="${img(p.imagen)}" alt="" />
          <span><strong>${esc(p.nombre)}</strong><small>${esc(p.presentacion)}</small>
          <span class="adm-alerta-num">${p.stock} de ${p.stockReferencia} paquetes · ${p.porcentajeStock} %</span></span>
          <button type="button" class="btn btn--naranja btn--chico" data-cargar="${esc(p.sku)}">Cargar stock</button></li>`).join("")}
      </ul>`;
    caja.querySelectorAll("[data-cargar]").forEach((b) => (b.onclick = () => abrirCargaDesdeAlerta(b.dataset.cargar)));
    const notif = caja.querySelector("[data-notif]");
    if (notif) notif.onclick = async () => {
      await Notification.requestPermission();
      pintarAlerta(bajos);
    };
  }

  // Compara con la revisión anterior: si un producto ENTRA en stock bajo, avisa.
  function procesarStockBajo(bajos) {
    const actuales = new Set(bajos.map((p) => p.sku));
    const nuevos = bajosConocidos ? bajos.filter((p) => !bajosConocidos.has(p.sku)) : bajos;
    if (nuevos.length) {
      const texto = nuevos.length === 1
        ? `Stock bajo: ${nuevos[0].nombre} (${nuevos[0].presentacion}) — quedan ${nuevos[0].stock} paquetes (${nuevos[0].porcentajeStock} %).`
        : `Stock bajo en ${nuevos.length} productos: ${nuevos.map((p) => p.nombre).join(", ")}.`;
      aviso(texto, "alerta");
      if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
        new Notification("Naranpol · Stock bajo", { body: texto, icon: LOGO, tag: "naranpol-stock" });
      }
    }
    bajosConocidos = actuales;
    pintarAlerta(bajos);
  }

  async function revisarStock() {
    try {
      const r = await api("/admin/resumen");
      porcentajeAlerta = r.porcentajeAlerta;
      procesarStockBajo(r.stockBajo);
      const badge = $("#badgeRevision");
      badge.hidden = !r.pagosEnRevision;
      badge.textContent = r.pagosEnRevision;
    } catch (e) {
      if (e.status === 401 || e.status === 403) mostrarAcceso(e.message);
    }
  }
  function iniciarRevision() {
    detenerRevision();
    timerRevision = setInterval(revisarStock, REVISAR_CADA_MS);
  }
  function detenerRevision() {
    clearInterval(timerRevision);
    bajosConocidos = null;
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && usuarioActual && !$("#admPanel").hidden) revisarStock();
  });

  async function abrirCargaDesdeAlerta(sku) {
    await asegurarProductos(true);
    dialogoStock(productos.find((p) => p.sku === sku), () => (pestañaActual === "stock" ? cargarStock() : cargarResumen()));
  }

  // ───────── RESUMEN ─────────
  async function cargarResumen() {
    const r = await api("/admin/resumen");
    porcentajeAlerta = r.porcentajeAlerta;
    const activos = ["pendiente_pago", "preparando", "enviado"].reduce((a, k) => a + (r.pedidosPorEstado[k] || 0), 0);
    $("#kpis").innerHTML = [
      ["Pedidos hoy", r.pedidosHoy],
      ["Pedidos en curso", activos],
      ["Pagos a verificar", r.pagosEnRevision, r.pagosEnRevision > 0],
      ["Facturado (no cancelado)", moneda(r.ventasCentavos)],
      ["Productos activos", r.productosActivos],
      ["Con stock bajo", r.stockBajo.length, r.stockBajo.length > 0],
    ].map(([t, v, alerta]) => `<div class="adm-kpi ${alerta ? "adm-kpi--alerta" : ""}"><small>${t}</small><strong>${esc(v)}</strong></div>`).join("");
    $("#resumenEstados").innerHTML = Object.entries(ESTADOS)
      .map(([k, e]) => `<div class="adm-fila-estado">${chip(e)}<strong>${r.pedidosPorEstado[k] || 0}</strong></div>`).join("");
    $("#reglaAlerta").textContent = `(≤ ${r.porcentajeAlerta} % del stock ideal)`;
    $("#resumenStockBajo").innerHTML = r.stockBajo.length
      ? r.stockBajo.map((p) => `<div class="adm-fila-estado adm-fila-producto">
          <img src="${img(p.imagen)}" alt="" />
          <span>${esc(p.nombre)} <span class="adm-sub-celda">${esc(p.sku)} · ${esc(p.presentacion)}</span>${barraStock(p)}</span>
          <button class="btn btn--naranja btn--chico" data-cargar="${esc(p.sku)}">Cargar</button></div>`).join("")
      : `<p class="adm-vacio">Todo en orden: ningún producto activo bajó al ${r.porcentajeAlerta} % de su stock ideal.</p>`;
    $("#resumenStockBajo").querySelectorAll("[data-cargar]").forEach((b) => (b.onclick = () => abrirCargaDesdeAlerta(b.dataset.cargar)));
    procesarStockBajo(r.stockBajo);
    const badge = $("#badgeRevision");
    badge.hidden = !r.pagosEnRevision;
    badge.textContent = r.pagosEnRevision;
  }

  function barraStock(p) {
    if (!p.stockReferencia) return "";
    const pct = Math.max(0, Math.min(100, p.porcentajeStock ?? 0));
    const tono = p.stockBajo ? "bajo" : pct <= 40 ? "medio" : "ok";
    return `<span class="adm-barra-stock adm-barra-stock--${tono}" title="${p.stock} de ${p.stockReferencia} (${p.porcentajeStock} %)">
      <span style="width:${pct}%"></span></span>`;
  }

  // ───────── STOCK / ABM ─────────
  let productos = [];
  let imagenes = null;
  async function asegurarProductos(forzar = false) {
    if (forzar || !productos.length) productos = (await api("/admin/productos")).productos;
  }
  async function cargarStock() {
    const d = await api("/admin/productos");
    productos = d.productos;
    porcentajeAlerta = d.porcentajeAlerta;
    pintarStock();
    procesarStockBajo(productos.filter((p) => p.activo && p.stockBajo));
  }
  function pintarStock() {
    const q = $("#stockBuscar").value.trim().toLowerCase();
    const filtro = $("#stockFiltro").value;
    const lista = productos.filter((p) => {
      if (filtro === "activos" && !p.activo) return false;
      if (filtro === "baja" && p.activo) return false;
      if (filtro === "bajos" && !(p.activo && p.stockBajo)) return false;
      return !q || [p.sku, p.nombre, p.sabor].some((v) => String(v || "").toLowerCase().includes(q));
    });
    $("#stockTabla").innerHTML = lista.length
      ? lista.map((p) => `<tr class="${p.activo ? "" : "inactivo"} ${p.activo && p.stockBajo ? "fila-alerta" : ""}">
          <td class="celda-foto"><img src="${img(p.imagen)}" alt="" class="${p.imagen ? "" : "sin-foto"}" /></td>
          <td><strong>${esc(p.nombre)}</strong>
            <span class="adm-sub-celda">${esc(p.presentacion)} · <code>${esc(p.sku)}</code></span>
            ${p.pruebaPago ? '<span class="adm-sub-celda">Producto de prueba de cobro</span>' : ""}</td>
          <td class="num">${moneda(p.precioCentavos)}</td>
          <td class="celda-stock">
            <span class="stock-num"><strong>${numero(p.stock)}</strong> <small>/ ${numero(p.stockReferencia || 0)}</small>
            ${p.activo && p.stockBajo ? '<span class="chip chip--bad">bajo</span>' : ""}</span>
            ${barraStock(p)}</td>
          <td>${!p.activo ? chip(["De baja", "gris"]) : p.imagen ? chip(["En la tienda", "ok"]) : chip(["Oculto: sin imagen", "warn"])}</td>
          <td><div class="acciones">
            <button class="btn btn--naranja btn--chico" data-stock="${esc(p.sku)}">Stock</button>
            <button class="btn btn--ghost btn--chico" data-editar="${esc(p.sku)}">Editar</button>
            ${p.activo
              ? `<button class="btn btn--peligro btn--chico" data-baja="${esc(p.sku)}">Dar de baja</button>`
              : `<button class="btn btn--ghost btn--chico" data-reactivar="${esc(p.sku)}">Reactivar</button>`}
          </div></td></tr>`).join("")
      : `<tr><td colspan="6" class="adm-vacio">No hay productos con ese filtro.</td></tr>`;
  }
  $("#stockBuscar").oninput = pintarStock;
  $("#stockFiltro").onchange = pintarStock;
  $("#nuevoProducto").onclick = () => accion($("#nuevoProducto"), () => dialogoProducto(null));

  $("#stockTabla").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const sku = b.dataset.stock || b.dataset.editar || b.dataset.baja || b.dataset.reactivar;
    const p = productos.find((x) => x.sku === sku);
    if (b.dataset.stock) dialogoStock(p, cargarStock);
    else if (b.dataset.editar) accion(b, () => dialogoProducto(p));
    else if (b.dataset.baja) {
      if (!confirm(`¿Dar de baja "${p.nombre} · ${p.presentacion}"? Dejará de verse en la tienda. Podés reactivarlo después.`)) return;
      accion(b, async () => {
        const r = await api(`/admin/productos/${encodeURIComponent(sku)}`, { method: "DELETE" });
        aviso(r.mensaje);
        await cargarStock();
      });
    } else if (b.dataset.reactivar) {
      accion(b, async () => {
        const r = await api(`/admin/productos/${encodeURIComponent(sku)}/reactivar`, { method: "POST", body: {} });
        aviso(r.mensaje);
        await cargarStock();
      });
    }
  };

  // Validación en el navegador (la misma que hace el servidor en backend/admin/validar.js).
  function validarFormProducto(f, alta) {
    const errores = {};
    const datos = {};
    const txt = (nombre, etiqueta, min, max) => {
      const v = f[nombre].value.trim().replace(/\s+/g, " ");
      if (!v) errores[nombre] = `Completá ${etiqueta}.`;
      else if (v.length < min) errores[nombre] = `Debe tener al menos ${min} caracteres.`;
      else if (v.length > max) errores[nombre] = `Admite hasta ${max} caracteres (tiene ${v.length}).`;
      datos[nombre] = v;
    };
    const ent = (nombre, etiqueta, min, max) => {
      const raw = f[nombre].value.trim();
      const n = leerEntero(raw);
      if (raw === "") errores[nombre] = `Completá ${etiqueta}.`;
      else if (!/^-?\d+$/.test(raw)) errores[nombre] = "Tiene que ser un número entero, sin puntos ni decimales.";
      else if (n < min) errores[nombre] = `Tiene que ser ${min} o más.`;
      else if (n > max) errores[nombre] = `No puede superar ${numero(max)}.`;
      datos[nombre] = n;
    };
    if (alta) {
      const sku = f.sku.value.trim().toUpperCase();
      if (!sku) errores.sku = "Completá el SKU.";
      else if (sku.length > 40) errores.sku = "El SKU admite hasta 40 caracteres.";
      else if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(sku)) errores.sku = "Usá solo letras, números y guiones entre medio. Ej.: JUG-NAR-2000-4";
      else if (productos.some((p) => p.sku === sku)) errores.sku = `Ya existe un producto con el SKU ${sku}. Elegí otro.`;
      datos.sku = sku;
    }
    txt("nombre", "el nombre", 2, 100);
    txt("sabor", "el sabor", 2, 50);
    txt("presentacion", "la presentación", 2, 100);
    ent("unidades", "las unidades por paquete", 1, 1000);
    const precio = leerPesos(f.precioCentavos.value);
    if (precio.error) errores.precioCentavos = precio.error;
    datos.precioCentavos = precio.centavos;
    if (alta) ent("stock", "el stock inicial", 0, 1_000_000);
    ent("stockReferencia", "el stock ideal", 1, 1_000_000);
    if (alta && !errores.stock && !errores.stockReferencia && datos.stockReferencia < datos.stock) {
      errores.stockReferencia = `No puede ser menor que el stock inicial (${datos.stock}).`;
    }
    datos.imagen = f.imagen.value;
    if (alta && !datos.imagen) errores.imagen = "Elegí una imagen: sin imagen el producto no se muestra en la tienda.";
    datos.activo = f.activo.checked;
    return { errores, datos };
  }

  // Alta (p = null) o edición
  async function dialogoProducto(p) {
    const alta = !p;
    if (!imagenes) imagenes = (await api("/admin/imagenes")).imagenes;
    await asegurarProductos();
    const actual = p?.imagen || "";
    abrirDialogo(`<h2>${alta ? "Nuevo producto" : "Editar producto"}</h2>
      <form class="adm-form" novalidate>
        <div class="adm-form-cols">
          <div class="adm-form-imagen">
            ${campo("imagen", "Imagen", `
              <input type="hidden" id="f-imagen" name="imagen" value="${esc(actual)}" />
              <div class="adm-preview"><img src="${img(actual)}" alt="Vista previa" data-preview-img /></div>
              <div class="adm-galeria" role="radiogroup" aria-label="Elegí una imagen" tabindex="-1">
                ${imagenes.map((ruta) => `<button type="button" role="radio" aria-checked="${ruta === actual}" data-img="${esc(ruta)}" title="${esc(ruta.split("/").pop())}"><img src="${esc(ruta)}" alt="" /></button>`).join("")}
                ${alta ? "" : `<button type="button" role="radio" aria-checked="${!actual}" data-img="" title="Sin imagen" class="sin-imagen">Sin<br>imagen</button>`}
              </div>`,
              "Para sumar fotos, copialas en <code>images/productos/</code> y volvé a abrir este formulario.")}
          </div>
          <div class="adm-form-datos">
            ${campo("sku", "SKU (código único)", `<input id="f-sku" name="sku" maxlength="40" autocomplete="off" value="${esc(p?.sku)}" ${alta ? "" : "disabled"} placeholder="JUG-NAR-2000-4" />`,
              alta ? "Letras, números y guiones. No se puede cambiar después." : "No se modifica: los pedidos lo usan.")}
            <div class="dos">
              ${campo("nombre", "Nombre", `<input id="f-nombre" name="nombre" maxlength="100" value="${esc(p?.nombre)}" placeholder="Jugo de naranja" />`)}
              ${campo("sabor", "Sabor", `<input id="f-sabor" name="sabor" maxlength="50" value="${esc(p?.sabor)}" placeholder="Naranja" list="saboresExistentes" />
                <datalist id="saboresExistentes">${[...new Set(productos.map((x) => x.sabor).filter(Boolean))].map((s) => `<option value="${esc(s)}">`).join("")}</datalist>`)}
            </div>
            ${campo("presentacion", "Presentación", `<input id="f-presentacion" name="presentacion" maxlength="100" value="${esc(p?.presentacion)}" placeholder="6 botellas de 1,5 L" />`)}
            <div class="dos">
              ${campo("unidades", "Unidades por paquete", `<input id="f-unidades" name="unidades" inputmode="numeric" value="${esc(p?.unidades ?? 6)}" />`)}
              ${campo("precioCentavos", "Precio por paquete ($)", `<input id="f-precioCentavos" name="precioCentavos" inputmode="decimal" placeholder="7.200,00" value="${p ? esc((p.precioCentavos / 100).toLocaleString("es-AR", { minimumFractionDigits: 2 })) : ""}" ${p?.pruebaPago ? "readonly" : ""} />`,
                p?.pruebaPago ? "La prueba de cobro siempre vale $200." : "")}
            </div>
            <div class="dos">
              ${alta ? campo("stock", "Stock inicial (paquetes)", `<input id="f-stock" name="stock" inputmode="numeric" value="0" />`) : ""}
              ${campo("stockReferencia", "Stock ideal (100 %)", `<input id="f-stockReferencia" name="stockReferencia" inputmode="numeric" value="${esc(p?.stockReferencia ?? "")}" placeholder="100" />`,
                `Te avisamos cuando quede el ${porcentajeAlerta} % o menos.`)}
            </div>
            <div class="adm-campo-form" data-campo="activo">
              <label class="adm-check"><input name="activo" type="checkbox" ${p?.activo === false ? "" : "checked"} /> Visible en la tienda</label>
              <p class="adm-msg-campo"></p>
            </div>
          </div>
        </div>
        <p class="adm-error" role="alert"></p>
        <div class="acciones">
          <button type="button" class="btn btn--ghost" data-cancelar>Cancelar</button>
          <button class="btn btn--primary" type="submit">${alta ? "Crear producto" : "Guardar cambios"}</button>
        </div>
      </form>`, "adm-dialog--ancho");

    const f = $("form", cuerpo);
    borrarErrorAlEscribir(f);
    $("[data-cancelar]", f).onclick = () => dialog.close();

    // Galería: elegir imagen
    $(".adm-galeria", f).onclick = (ev) => {
      const b = ev.target.closest("[data-img]");
      if (!b) return;
      f.imagen.value = b.dataset.img;
      $("[data-preview-img]", f).src = b.dataset.img || LOGO;
      f.querySelectorAll("[data-img]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      const caja = f.querySelector('[data-campo="imagen"]');
      caja.classList.remove("con-error");
      $(".adm-msg-campo", caja).textContent = "";
    };

    // En el alta, el stock ideal copia al inicial hasta que lo edites a mano.
    if (alta) {
      let tocado = false;
      f.stockReferencia.addEventListener("input", () => (tocado = true));
      f.stock.addEventListener("input", () => {
        if (!tocado) f.stockReferencia.value = f.stock.value === "0" ? "" : f.stock.value;
      });
      f.sku.addEventListener("input", () => (f.sku.value = f.sku.value.toUpperCase()));
    }

    f.onsubmit = (e) => {
      e.preventDefault();
      limpiarErrores(f);
      const { errores, datos } = validarFormProducto(f, alta);
      if (!marcarErrores(f, errores)) return;
      if (!alta) delete datos.sku;
      const boton = $('[type="submit"]', f);
      boton.disabled = true;
      (async () => {
        try {
          const r = alta
            ? await api("/admin/productos", { method: "POST", body: datos })
            : await api(`/admin/productos/${encodeURIComponent(p.sku)}`, { method: "PUT", body: datos });
          dialog.close();
          aviso(r.mensaje, "ok");
          if (r.producto?.stockBajo) aviso(`${r.mensaje} Ojo: arranca con stock bajo (${r.producto.porcentajeStock} %).`, "alerta");
          await cargarStock();
        } catch (err) {
          errorDeServidor(f, err);
        } finally {
          boton.disabled = false;
        }
      })();
    };
    (alta ? f.sku : f.nombre).focus();
  }

  // Carga / movimiento de stock
  function dialogoStock(p, alTerminar) {
    if (!p) return aviso("Producto no encontrado. Actualizá la lista.", "error");
    abrirDialogo(`
      <div class="adm-dialog-cabecera">
        <img src="${img(p.imagen)}" alt="" />
        <div><h2>${esc(p.nombre)}</h2>
        <p class="adm-sub">${esc(p.presentacion)} · <code>${esc(p.sku)}</code></p>
        <p class="adm-sub">Stock actual: <strong>${numero(p.stock)}</strong> de ${numero(p.stockReferencia || 0)} ideales ${barraStock(p)}</p></div>
      </div>
      <form class="adm-form" novalidate>
        ${campo("tipo", "Tipo de movimiento", `<select id="f-tipo" name="tipo">
            <option value="ingreso">Ingreso de mercadería (suma)</option>
            <option value="egreso">Egreso: rotura, merma, vencido (resta)</option>
            <option value="ajuste">Ajuste por conteo físico (fija el total)</option>
          </select>`)}
        ${campo("cantidad", '<span data-etiqueta>Cantidad a sumar</span>', `<input id="f-cantidad" name="cantidad" inputmode="numeric" autocomplete="off" />`)}
        ${campo("motivo", "Motivo / comprobante", `<input id="f-motivo" name="motivo" maxlength="200" placeholder="Remito 0001-00001234" />`, '<span data-ayuda>Opcional en ingresos.</span>')}
        <p class="adm-preview-stock" data-preview></p>
        <p class="adm-error" role="alert"></p>
        <div class="acciones">
          <button type="button" class="btn btn--ghost" data-cancelar>Cancelar</button>
          <button class="btn btn--primary" type="submit">Registrar movimiento</button>
        </div>
      </form>`);
    const f = $("form", cuerpo);
    borrarErrorAlEscribir(f);
    $("[data-cancelar]", f).onclick = () => dialog.close();
    const ref = p.stockReferencia || 0;
    const actualizar = () => {
      const tipo = f.tipo.value;
      const n = Number(f.cantidad.value);
      $("[data-etiqueta]", f).textContent =
        { ingreso: "Cantidad a sumar", egreso: "Cantidad a descontar", ajuste: "Stock contado (total real)" }[tipo];
      $("[data-ayuda]", f).textContent = tipo === "ingreso" ? "Opcional en ingresos." : "Obligatorio: explicá el motivo.";
      const vista = $("[data-preview]", f);
      if (f.cantidad.value.trim() === "" || !Number.isInteger(n)) return (vista.innerHTML = "");
      const nuevo = tipo === "ingreso" ? p.stock + n : tipo === "egreso" ? p.stock - n : n;
      const nuevaRef = Math.max(ref, nuevo);
      const bajo = nuevo * 100 <= nuevaRef * porcentajeAlerta;
      vista.className = `adm-preview-stock ${nuevo < 0 ? "mal" : bajo ? "bajo" : "bien"}`;
      vista.innerHTML = nuevo < 0
        ? `No alcanza: hay ${p.stock} paquetes.`
        : `Quedará en <strong>${numero(nuevo)}</strong> paquetes (${nuevaRef ? Math.round((nuevo / nuevaRef) * 100) : 0} % del ideal)${bajo ? " — seguirá en stock bajo" : ""}.`;
    };
    f.tipo.onchange = actualizar;
    f.cantidad.oninput = actualizar;
    f.onsubmit = (e) => {
      e.preventDefault();
      limpiarErrores(f);
      const tipo = f.tipo.value;
      const raw = f.cantidad.value.trim();
      const n = Number(raw);
      const motivo = f.motivo.value.trim();
      const errores = {};
      if (raw === "") errores.cantidad = tipo === "ajuste" ? "Completá el stock contado." : "Completá la cantidad.";
      else if (!/^\d+$/.test(raw)) errores.cantidad = "Tiene que ser un número entero positivo, sin puntos ni decimales.";
      else if (tipo !== "ajuste" && n < 1) errores.cantidad = "Tiene que ser 1 o más.";
      else if (tipo === "egreso" && n > p.stock) errores.cantidad = `No podés descontar más de lo que hay (${p.stock}).`;
      else if (n > 1_000_000) errores.cantidad = "No puede superar 1.000.000.";
      if (tipo !== "ingreso" && motivo.length < 3) errores.motivo = "Explicá el motivo (al menos 3 caracteres).";
      if (!marcarErrores(f, errores)) return;
      const boton = $('[type="submit"]', f);
      boton.disabled = true;
      (async () => {
        try {
          const r = await api(`/admin/productos/${encodeURIComponent(p.sku)}/stock`, {
            method: "POST", body: { tipo, cantidad: n, motivo },
          });
          dialog.close();
          aviso(r.mensaje, r.producto.stockBajo ? "alerta" : "ok");
          productos = [];
          await alTerminar();
          await revisarStock();
        } catch (err) {
          errorDeServidor(f, err);
        } finally {
          boton.disabled = false;
        }
      })();
    };
    f.cantidad.focus();
  }

  // ───────── PEDIDOS ─────────
  let pagina = 1;
  async function cargarPedidos() {
    const params = new URLSearchParams({ pagina });
    if ($("#pedEstado").value) params.set("estado", $("#pedEstado").value);
    if ($("#pedPago").value) params.set("pago", $("#pedPago").value);
    if ($("#pedTipo").value) params.set("tipo", $("#pedTipo").value);
    const d = await api("/admin/pedidos?" + params);
    $("#pedTabla").innerHTML = d.pedidos.length
      ? d.pedidos.map((p) => `<tr>
          <td><code>${corto(p.id)}</code>${p.pruebaPago ? '<span class="adm-sub-celda">Prueba $200</span>' : ""}</td>
          <td>${fecha(p.createdAt)}</td>
          <td>${esc(p.cliente.nombre)}<span class="adm-sub-celda">${esc(p.cliente.email)}</span></td>
          <td class="num">${moneda(p.totalCentavos)}</td>
          <td>${chip(ESTADOS[p.estado] || [p.estado, "gris"])}</td>
          <td>${chip(PAGOS[p.pago] || [p.pago, "gris"])}</td>
          <td><div class="acciones"><button class="btn btn--ghost btn--chico" data-ver="${esc(p.id)}">Ver</button></div></td></tr>`).join("")
      : `<tr><td colspan="7" class="adm-vacio">No hay pedidos con estos filtros.</td></tr>`;
    $("#pedPaginacion").innerHTML = d.paginas > 1
      ? `<button class="btn btn--ghost btn--chico" data-pag="${d.pagina - 1}" ${d.pagina <= 1 ? "disabled" : ""}>‹ Anterior</button>
         <span>Página ${d.pagina} de ${d.paginas} · ${d.total} pedidos</span>
         <button class="btn btn--ghost btn--chico" data-pag="${d.pagina + 1}" ${d.pagina >= d.paginas ? "disabled" : ""}>Siguiente ›</button>`
      : `<span>${d.total} pedido${d.total === 1 ? "" : "s"}</span>`;
  }
  ["#pedEstado", "#pedPago", "#pedTipo"].forEach((s) => ($(s).onchange = () => { pagina = 1; accion(null, cargarPedidos); }));
  $("#pedActualizar").onclick = (e) => accion(e.currentTarget, cargarPedidos);
  $("#pedPaginacion").onclick = (e) => {
    const b = e.target.closest("[data-pag]");
    if (b) { pagina = Number(b.dataset.pag); accion(b, cargarPedidos); }
  };
  $("#pedTabla").onclick = (e) => {
    const b = e.target.closest("[data-ver]");
    if (b) accion(b, async () => {
      await asegurarProductos();
      verPedido((await api(`/admin/pedidos/${b.dataset.ver}`)).pedido);
    });
  };

  function verPedido(p) {
    const en = p.entrega || {};
    const sig = SIGUIENTE[p.estado];
    const puedeCancelar = !p.pruebaPago && ["pendiente_pago", "preparando"].includes(p.estado) && p.pago === "pendiente";
    const fotoDe = (sku) => productos.find((x) => x.sku === sku)?.imagen;
    abrirDialogo(`<h2>Pedido ${corto(p.id)}</h2>
      <div class="adm-detalle">
        <p>${chip(ESTADOS[p.estado] || [p.estado, "gris"])} ${chip(PAGOS[p.pago] || [p.pago, "gris"])} ${p.pruebaPago ? chip(["Prueba de $200", "info"]) : ""}</p>
        <p class="adm-sub">Creado ${fecha(p.createdAt)}${p.pagadoEn ? ` · pagado ${fecha(p.pagadoEn)}` : ""}${p.canceladoEn ? ` · cancelado ${fecha(p.canceladoEn)}` : ""}</p>
        <div class="adm-caja">
          <strong>Cliente:</strong> ${esc(p.cliente.nombre)} · ${esc(p.cliente.email)}<br />
          ${p.pruebaPago ? "Sin entrega (prueba de cobro)." : `<strong>Entrega:</strong> ${esc(en.nombre)} · Tel. ${esc(en.telefono)}<br />
          ${esc(en.calle)} ${esc(en.numero)}, ${esc(en.localidad)} (CP ${esc(en.codigoPostal)})${en.referencia ? `<br />Ref.: ${esc(en.referencia)}` : ""}`}
        </div>
        <ul class="adm-items">${p.items.map((i) => `<li><img src="${img(fotoDe(i.sku))}" alt="" />
          <span>${i.cantidad} × ${esc(i.nombre)} · ${esc(i.presentacion)} <span class="adm-sub-celda">${esc(i.sku)} · ${moneda(i.precioCentavos)} c/u</span></span></li>`).join("")}</ul>
        <p>Subtotal ${moneda(p.subtotalCentavos)} · Envío ${moneda(p.envioCentavos)} · <strong>Total ${moneda(p.totalCentavos)}</strong></p>
        ${p.referenciaPago ? `<p>Operación informada por el cliente: <code>${esc(p.referenciaPago)}</code></p>` : ""}
      </div>
      <p class="adm-error" role="alert"></p>
      <div class="adm-form"><div class="acciones">
        ${p.pruebaPago && p.pago === "en_revision" && p.estado !== "cancelado"
          ? `<button class="btn btn--primary" data-confirmar>Confirmar ingreso verificado en Mercado Pago</button>` : ""}
        ${!p.pruebaPago && p.estado !== "cancelado" && p.pago !== "pagado" ? `<button class="btn btn--ghost" data-pagado>Registrar pago</button>` : ""}
        ${puedeCancelar ? `<button class="btn btn--peligro" data-estado="cancelado">Cancelar y reponer stock</button>` : ""}
        ${sig && !p.pruebaPago ? `<button class="btn btn--primary" data-estado="${sig}">Pasar a “${ESTADOS[sig][0]}”</button>` : ""}
      </div></div>`);
    const error = $(".adm-error", cuerpo);
    const refrescar = async (r) => {
      aviso(r.mensaje || "Pedido actualizado.", "ok");
      verPedido((await api(`/admin/pedidos/${p.id}`)).pedido);
      cargarPedidos().catch(() => {});
      revisarStock();
    };
    cuerpo.querySelectorAll("[data-estado]").forEach((b) => (b.onclick = () => {
      const nuevo = b.dataset.estado;
      if (nuevo === "cancelado" && !confirm("¿Cancelar el pedido? Los paquetes vuelven al stock y el cliente lo verá como Cancelado.")) return;
      if (nuevo === "preparando" && p.pago !== "pagado" && !confirm("El pedido todavía no figura como pagado. ¿Preparar igual?")) return;
      accion(b, async () => refrescar(await api(`/admin/pedidos/${p.id}/estado`, { method: "PATCH", body: { estado: nuevo } })), error);
    }));
    const pagado = $("[data-pagado]", cuerpo);
    if (pagado) pagado.onclick = () => {
      if (!confirm("¿Confirmás que el dinero de este pedido ya ingresó?")) return;
      accion(pagado, async () => refrescar(await api(`/admin/pedidos/${p.id}/marcar-pagado`, { method: "POST", body: {} })), error);
    };
    const confirmar = $("[data-confirmar]", cuerpo);
    if (confirmar) confirmar.onclick = () => {
      if (!confirm(`¿Verificaste en Mercado Pago el ingreso de $200 con la operación ${p.referenciaPago}?`)) return;
      // Reutiliza la ruta que ya existe en backend/tienda/index.js
      accion(confirmar, async () => refrescar(await api(`/tienda/admin/pedidos/${p.id}/confirmar-pago`, {
        method: "POST", body: { verificadoEnMercadoPago: true },
      })), error);
    };
  }

  // ───────── MOVIMIENTOS ─────────
  async function cargarMovimientos() {
    const sku = $("#movSku").value.trim().toUpperCase();
    if (sku && !/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(sku)) return aviso("El SKU a buscar solo lleva letras, números y guiones.", "error");
    const d = await api("/admin/movimientos" + (sku ? "?sku=" + encodeURIComponent(sku) : ""));
    $("#movTabla").innerHTML = d.movimientos.length
      ? d.movimientos.map((m) => `<tr>
          <td>${fecha(m.createdAt)}</td>
          <td><code>${esc(m.sku)}</code></td>
          <td>${esc(TIPOS_MOV[m.tipo] || m.tipo)}</td>
          <td class="num"><strong class="${m.delta >= 0 ? "txt-ok" : "txt-bad"}">${m.delta > 0 ? "+" : ""}${m.delta}</strong></td>
          <td class="num">${m.stockAnterior} → ${m.stockNuevo}</td>
          <td>${esc(m.motivo || "—")}</td>
          <td>${esc(m.usuario?.nombre || "—")}</td></tr>`).join("")
      : `<tr><td colspan="7" class="adm-vacio">Todavía no hay movimientos registrados${sku ? " para ese SKU" : ""}.</td></tr>`;
  }
  $("#movActualizar").onclick = (e) => accion(e.currentTarget, cargarMovimientos);
  $("#movSku").onkeydown = (e) => { if (e.key === "Enter") accion(null, cargarMovimientos); };

  iniciar();
})();
