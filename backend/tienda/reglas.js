const crypto = require('node:crypto');
function fallo(mensaje, status = 400) { throw Object.assign(new Error(mensaje), { status }); }
function texto(valor, campo, min = 1, max = 120) {
  if (typeof valor !== 'string' || valor.trim().length < min || valor.trim().length > max) fallo(`Revisá ${campo}.`);
  return valor.trim();
}
function validarPedido(body) {
  if (!body || !Array.isArray(body.items) || !body.items.length || body.items.length > 20) fallo('El carrito debe tener entre 1 y 20 productos.');
  const vistos = new Set();
  const items = body.items.map(item => {
    if (!item || typeof item.sku !== 'string' || !/^[A-Z0-9-]{1,40}$/.test(item.sku)) fallo('Producto inválido.');
    if (!Number.isInteger(item.cantidad) || item.cantidad < 1 || item.cantidad > 100) fallo('Elegí entre 1 y 100 paquetes por producto.');
    if (vistos.has(item.sku)) fallo('Hay productos repetidos en el pedido.');
    vistos.add(item.sku);
    return { sku: item.sku, cantidad: item.cantidad };
  }).sort((a,b) => a.sku.localeCompare(b.sku));
  const pruebaPago = items.some(i => i.sku === 'TP-PAGO-200');
  if (pruebaPago && (items.length !== 1 || items[0].cantidad !== 1)) fallo('La prueba de $200 se compra sola y una sola unidad.');
  const d = body.entrega || {};
  const entrega = pruebaPago ? { nombre: 'Prueba sin entrega', telefono: '', calle: '', numero: '', localidad: '', codigoPostal: '', referencia: '' } : {
    nombre: texto(d.nombre, 'el nombre', 2, 100),
    telefono: texto(d.telefono, 'el teléfono', 6, 30),
    calle: texto(d.calle, 'la calle', 2, 100),
    numero: texto(d.numero, 'la altura', 1, 10),
    localidad: texto(d.localidad, 'la localidad', 2, 100),
    codigoPostal: texto(d.codigoPostal, 'el código postal', 4, 12),
    referencia: d.referencia ? texto(d.referencia, 'la referencia', 1, 200) : '',
  };
  const clave = texto(body.clave, 'el identificador del pedido', 16, 64);
  if (!/^[\w-]+$/.test(clave)) fallo('Identificador de pedido inválido.');
  const huella = crypto.createHash('sha256').update(JSON.stringify({ items, entrega })).digest('hex');
  return { items, entrega, clave, huella, pruebaPago };
}
function costoEnvio(subtotal) { return subtotal >= 5000000 ? 0 : 250000; }
module.exports = { fallo, validarPedido, costoEnvio };
