// Validaciones del panel de administración.
// Funciones puras (sin base de datos) para poder probarlas con `node --test`.
//
// Cuando algo está mal se lanza un error 400 con `campos`: { nombreDelCampo: 'qué corregir' }.
// El panel usa ese objeto para marcar en rojo cada campo y mostrar el mensaje debajo.

function fallo(mensaje, status = 400, campos) {
  throw Object.assign(new Error(mensaje), { status, ...(campos && { campos }) });
}

const SKU = /^[A-Z0-9]+(-[A-Z0-9]+)*$/; // JUG-NAR-6 (sin guiones al principio, al final ni dobles)
const IMAGEN = /^images\/productos\/[a-z0-9][a-z0-9._-]{0,80}\.(jpe?g|png|webp)$/i;
const MAX_PRECIO_CENTAVOS = 10_000_000_000; // $100.000.000
const MAX_STOCK = 1_000_000;
const PORCENTAJE_ALERTA = 20; // stock bajo = 20 % o menos del stock ideal

// Devuelve true si el stock está en el 20 % o menos del stock ideal (sin decimales: stock*100 <= ideal*20).
function esStockBajo(stock, stockReferencia) {
  if (!Number.isFinite(stockReferencia) || stockReferencia <= 0) return false;
  return stock * 100 <= stockReferencia * PORCENTAJE_ALERTA;
}

function crearValidador() {
  const errores = {};
  const salida = {};
  const vacio = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim());
  return {
    errores,
    salida,
    texto(body, campo, etiqueta, { min, max, requerido = true }) {
      const v = body[campo];
      if (vacio(v)) {
        if (requerido) errores[campo] = `Completá ${etiqueta}.`;
        else salida[campo] = '';
        return;
      }
      if (typeof v !== 'string') return (errores[campo] = `${cap(etiqueta)} debe ser texto.`);
      const t = v.trim().replace(/\s+/g, ' ');
      if (t.length < min) return (errores[campo] = `${cap(etiqueta)} debe tener al menos ${min} caracteres.`);
      if (t.length > max) return (errores[campo] = `${cap(etiqueta)} admite hasta ${max} caracteres (tiene ${t.length}).`);
      salida[campo] = t;
    },
    entero(body, campo, etiqueta, { min, max, requerido = true }) {
      const v = body[campo];
      if (vacio(v)) {
        if (requerido) errores[campo] = `Completá ${etiqueta}.`;
        return;
      }
      if (typeof v !== 'number' || !Number.isFinite(v)) return (errores[campo] = `${cap(etiqueta)} debe ser un número.`);
      if (!Number.isInteger(v)) return (errores[campo] = `${cap(etiqueta)} debe ser un número entero, sin decimales.`);
      if (v < min) return (errores[campo] = `${cap(etiqueta)} debe ser ${min} o más.`);
      if (v > max) return (errores[campo] = `${cap(etiqueta)} no puede superar ${max.toLocaleString('es-AR')}.`);
      salida[campo] = v;
    },
    error(campo, mensaje) { errores[campo] = mensaje; },
    terminar(mensaje = 'Revisá los campos marcados.') {
      const cantidad = Object.keys(errores).length;
      if (cantidad) fallo(cantidad === 1 ? Object.values(errores)[0] : mensaje, 400, errores);
      return salida;
    },
  };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Alta: todos los campos. Edición: sin SKU ni stock (el stock se mueve desde "Stock").
function validarProducto(body, { alta = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fallo('Enviá los datos del producto.');
  const v = crearValidador();

  if (alta) {
    const s = body.sku;
    if (typeof s !== 'string' || !s.trim()) v.error('sku', 'Completá el SKU.');
    else {
      const sku = s.trim().toUpperCase();
      if (sku.length > 40) v.error('sku', 'El SKU admite hasta 40 caracteres.');
      else if (!SKU.test(sku)) v.error('sku', 'Usá solo letras, números y guiones entre medio. Ej.: JUG-NAR-2000-4');
      else v.salida.sku = sku;
    }
  }
  v.texto(body, 'nombre', 'el nombre', { min: 2, max: 100 });
  v.texto(body, 'sabor', 'el sabor', { min: 2, max: 50 });
  v.texto(body, 'presentacion', 'la presentación', { min: 2, max: 100 });
  v.entero(body, 'unidades', 'las unidades por paquete', { min: 1, max: 1000 });
  v.entero(body, 'precioCentavos', 'el precio', { min: 1, max: MAX_PRECIO_CENTAVOS });
  if (body.precioCentavos === 0) v.error('precioCentavos', 'El precio tiene que ser mayor a $0.');

  if (alta) v.entero(body, 'stock', 'el stock inicial', { min: 0, max: MAX_STOCK });
  v.entero(body, 'stockReferencia', 'el stock ideal', { min: 1, max: MAX_STOCK });
  if (alta && v.salida.stock !== undefined && v.salida.stockReferencia !== undefined
      && v.salida.stockReferencia < v.salida.stock) {
    v.error('stockReferencia', `El stock ideal no puede ser menor que el stock inicial (${v.salida.stock}).`);
  }

  const img = body.imagen;
  if (img === undefined || img === null || img === '') {
    if (alta) v.error('imagen', 'Elegí una imagen: sin imagen el producto no se muestra en la tienda.');
    else v.salida.imagen = '';
  } else if (typeof img !== 'string' || !IMAGEN.test(img)) {
    v.error('imagen', 'La imagen tiene que estar en la carpeta images/productos (jpg, png o webp).');
  } else v.salida.imagen = img;

  if (body.activo !== undefined) {
    if (typeof body.activo !== 'boolean') v.error('activo', 'Indicá si el producto está visible o no.');
    else v.salida.activo = body.activo;
  }
  return v.terminar();
}

function validarSku(valor) {
  const sku = typeof valor === 'string' ? valor.trim().toUpperCase() : '';
  if (!sku || sku.length > 40 || !SKU.test(sku)) fallo('SKU inválido.');
  return sku;
}

// Movimiento de stock:
//  - ingreso: llegó mercadería (suma)
//  - egreso: rotura, merma, vencimiento (resta, nunca deja negativo)
//  - ajuste: conteo físico; fija el stock en el valor indicado
const TIPOS_STOCK = ['ingreso', 'egreso', 'ajuste'];
function validarMovimiento(body) {
  if (!body || typeof body !== 'object') fallo('Enviá los datos del movimiento.');
  const v = crearValidador();
  if (!TIPOS_STOCK.includes(body.tipo)) v.error('tipo', 'Elegí ingreso, egreso o ajuste.');
  const etiqueta = body.tipo === 'ajuste' ? 'el stock contado' : 'la cantidad';
  v.entero(body, 'cantidad', etiqueta, { min: body.tipo === 'ajuste' ? 0 : 1, max: MAX_STOCK });
  v.texto(body, 'motivo', 'el motivo', { min: 3, max: 200, requerido: body.tipo === 'egreso' || body.tipo === 'ajuste' });
  const r = v.terminar();
  return { tipo: body.tipo, cantidad: r.cantidad, motivo: r.motivo || '' };
}

// Flujo de un pedido común. Las pruebas de $200 se cierran con "confirmar pago".
const TRANSICIONES = {
  pendiente_pago: ['preparando', 'cancelado'],
  preparando: ['enviado', 'cancelado'],
  enviado: ['entregado'],
  entregado: [],
  cancelado: [],
};

function validarCambioEstado(pedido, nuevoEstado) {
  if (!Object.hasOwn(TRANSICIONES, nuevoEstado)) fallo('Estado inválido.');
  if (pedido.pruebaPago) fallo('Las pruebas de pago de $200 se cierran con "Confirmar ingreso verificado".', 409);
  if (!TRANSICIONES[pedido.estado].includes(nuevoEstado)) {
    fallo(`No se puede pasar de "${pedido.estado}" a "${nuevoEstado}".`, 409);
  }
  if (nuevoEstado === 'cancelado' && pedido.pago !== 'pendiente') {
    fallo('El pedido tiene un pago informado o acreditado. Resolvé la devolución antes de cancelarlo.', 409);
  }
}

module.exports = {
  fallo, validarSku, validarProducto, validarMovimiento, validarCambioEstado, esStockBajo,
  TRANSICIONES, SKU, IMAGEN, PORCENTAJE_ALERTA,
};
