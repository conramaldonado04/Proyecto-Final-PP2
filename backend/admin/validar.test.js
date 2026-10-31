// Ejecutar: node --test admin/validar.test.js   (desde la carpeta backend)
const test = require('node:test');
const assert = require('node:assert/strict');
const { validarProducto, validarMovimiento, validarCambioEstado, validarSku, esStockBajo } = require('./validar');

const producto = () => ({
  sku: 'jug-nar-2000-4', nombre: 'Jugo de naranja', sabor: 'Naranja', presentacion: '4 botellas de 2 L',
  unidades: 4, precioCentavos: 650000, stock: 30, stockReferencia: 100, imagen: 'images/productos/naranja-1500.jpg',
});
const camposConError = (fn) => {
  try { fn(); } catch (e) { return Object.keys(e.campos || {}).sort(); }
  assert.fail('Se esperaba un error');
};

test('alta válida: normaliza el SKU a mayúsculas', () => {
  const p = validarProducto(producto(), { alta: true });
  assert.equal(p.sku, 'JUG-NAR-2000-4');
  assert.equal(p.stock, 30);
  assert.equal(p.stockReferencia, 100);
});
test('informa TODOS los campos mal a la vez, cada uno con su mensaje', () => {
  const malo = { sku: '-MAL-', nombre: 'A', sabor: '', presentacion: 'x'.repeat(101), unidades: 1.5, precioCentavos: 0, stock: -1, stockReferencia: 'diez', imagen: '../../etc/passwd' };
  assert.deepEqual(
    camposConError(() => validarProducto(malo, { alta: true })),
    ['imagen', 'nombre', 'precioCentavos', 'presentacion', 'sabor', 'sku', 'stock', 'stockReferencia', 'unidades'],
  );
});
test('el mensaje dice qué corregir', () => {
  try { validarProducto({ ...producto(), unidades: 2.5 }, { alta: true }); } catch (e) {
    assert.match(e.campos.unidades, /entero/);
    assert.equal(e.status, 400);
  }
});
test('alta sin imagen: explica que no se verá en la tienda', () => {
  const p = producto(); delete p.imagen;
  try { validarProducto(p, { alta: true }); assert.fail(); } catch (e) { assert.match(e.campos.imagen, /tienda/); }
});
test('el stock ideal no puede ser menor que el stock inicial', () => {
  assert.deepEqual(camposConError(() => validarProducto({ ...producto(), stock: 50, stockReferencia: 40 }, { alta: true })), ['stockReferencia']);
});
test('la edición ignora SKU y stock enviados por el navegador', () => {
  const p = validarProducto({ ...producto(), stock: 999999 });
  assert.equal(p.sku, undefined);
  assert.equal(p.stock, undefined);
});
test('rechaza precios con decimales, negativos, cero o como texto', () => {
  for (const precio of [-1, 10.5, '1000', null, 0]) assert.deepEqual(camposConError(() => validarProducto({ ...producto(), precioCentavos: precio })), ['precioCentavos']);
});
test('SKU: rechaza espacios, guiones bajos, guiones sueltos y operadores', () => {
  for (const sku of ['', 'JUG NAR', 'JUG_NAR', '$where', 'A'.repeat(41), 'JUG--NAR', '-JUG']) assert.throws(() => validarSku(sku));
});
test('stock bajo: se activa al 20 % o menos del stock ideal', () => {
  assert.equal(esStockBajo(21, 100), false);
  assert.equal(esStockBajo(20, 100), true);
  assert.equal(esStockBajo(16, 80), true);
  assert.equal(esStockBajo(17, 80), false);
  assert.equal(esStockBajo(0, 1), true);
  assert.equal(esStockBajo(5, undefined), false);
});
test('movimientos: ingreso sin motivo sí, egreso sin motivo no', () => {
  assert.equal(validarMovimiento({ tipo: 'ingreso', cantidad: 10 }).cantidad, 10);
  assert.deepEqual(camposConError(() => validarMovimiento({ tipo: 'egreso', cantidad: 2 })), ['motivo']);
  assert.equal(validarMovimiento({ tipo: 'egreso', cantidad: 2, motivo: 'Rotura' }).motivo, 'Rotura');
});
test('ajuste permite fijar en cero; ingreso no permite cero', () => {
  assert.equal(validarMovimiento({ tipo: 'ajuste', cantidad: 0, motivo: 'Inventario' }).cantidad, 0);
  assert.deepEqual(camposConError(() => validarMovimiento({ tipo: 'ingreso', cantidad: 0 })), ['cantidad']);
  assert.throws(() => validarMovimiento({ tipo: 'regalo', cantidad: 1 }));
});
test('estados: sigue el flujo y no salta pasos', () => {
  const p = { estado: 'pendiente_pago', pago: 'pendiente', pruebaPago: false };
  assert.doesNotThrow(() => validarCambioEstado(p, 'preparando'));
  assert.throws(() => validarCambioEstado(p, 'entregado'));
  assert.throws(() => validarCambioEstado({ ...p, estado: 'entregado' }, 'cancelado'));
  assert.throws(() => validarCambioEstado(p, 'constructor'));
});
test('no cancela pedidos con pago informado o acreditado', () => {
  assert.throws(() => validarCambioEstado({ estado: 'preparando', pago: 'pagado' }, 'cancelado'));
  assert.throws(() => validarCambioEstado({ estado: 'pendiente_pago', pago: 'en_revision' }, 'cancelado'));
});
