const test = require('node:test');
const assert = require('node:assert/strict');
const { validarPerfil, comprobarCompra } = require('./perfil-comercial');
const base = { tipoCliente: 'minorista', telefono: '342 5551234' };
const negocio = { ...base, tipoCliente: 'mayorista', cuit: '30-71234567-1', negocio: 'Almacén Santa Fe', domicilioComercial: 'San Martín 100, Santa Fe' };
test('minorista exige teléfono y no necesita datos de negocio', () => {
  assert.equal(validarPerfil(base).ok, true);
  assert.equal(validarPerfil({ ...base, telefono: '' }).ok, false);
});
test('rechaza tipo admin, campos objeto y CUIT inválido', () => {
  assert.equal(validarPerfil({ ...base, tipoCliente: 'admin' }).ok, false);
  assert.equal(validarPerfil({ ...base, telefono: { $gt: '' } }).ok, false);
  assert.equal(validarPerfil({ ...negocio, cuit: '12345678901' }).ok, false);
});
test('mayorista exige CUIT, negocio y domicilio', () => {
  assert.equal(validarPerfil(negocio).ok, true);
  for (const campo of ['cuit', 'negocio', 'domicilioComercial']) assert.equal(validarPerfil({ ...negocio, [campo]: '' }).ok, false);
});
test('distribuidor exige también zona y volumen', () => {
  assert.equal(validarPerfil({ ...negocio, tipoCliente: 'distribuidor' }).ok, false);
  assert.equal(validarPerfil({ ...negocio, tipoCliente: 'distribuidor', zonaDistribucion: 'Santa Fe y alrededores', volumenEstimado: '101 a 500 packs' }).ok, true);
});
test('cuenta minorista: rechaza carrito vacío y acepta 1 pack o más', () => {
  const u = { rol: 'cliente', tipoCliente: 'minorista' };
  assert.throws(() => comprobarCompra(u, { items: [] }), /1 pack/);
  assert.doesNotThrow(() => comprobarCompra(u, { items: [{ cantidad: 1 }] }));
  assert.doesNotThrow(() => comprobarCompra(u, { items: [{ cantidad: 2 }, { cantidad: 4 }] }));
});
test('cuentas antiguas requieren completar perfil; admin y prueba conservan flujo', () => {
  assert.throws(() => comprobarCompra({ rol: 'cliente' }, { items: [{ cantidad: 6 }] }), /perfil/);
  assert.doesNotThrow(() => comprobarCompra({ rol: 'admin' }, { items: [{ cantidad: 1 }] }));
  assert.doesNotThrow(() => comprobarCompra({ rol: 'cliente' }, { pruebaPago: true, items: [{ cantidad: 1 }] }));
});
test('otros tipos no reciben mínimos inventados ni permisos enviados por cliente', () => {
  for (const tipoCliente of ['mayorista', 'distribuidor']) assert.doesNotThrow(() => comprobarCompra({ rol: 'cliente', tipoCliente }, { items: [{ cantidad: 1 }] }));
  const r = validarPerfil({ ...base, rol: 'admin', passwordHash: 'inyectado' });
  assert.equal(r.perfil.rol, undefined);
  assert.equal(r.perfil.passwordHash, undefined);
});
