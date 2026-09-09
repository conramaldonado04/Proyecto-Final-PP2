const test = require('node:test');
const assert = require('node:assert/strict');
const { validarPedido, costoEnvio } = require('./reglas');
const base = () => ({ clave:'12345678-1234-1234-1234-123456789012', items:[{sku:'JUG-NAR-6',cantidad:2}], entrega:{nombre:'Cliente Prueba',telefono:'3421234567',calle:'Calle Ficticia',numero:'123',localidad:'Santa Fe',codigoPostal:'3000'} });
test('rechaza cantidades negativas, fraccionarias y excesivas',()=>{
  for(const n of [-1,0,1.5,101,'2']) { const p=base(); p.items[0].cantidad=n; assert.throws(()=>validarPedido(p)); }
});
test('rechaza el mismo SKU repetido',()=>{ const p=base(); p.items.push({...p.items[0]}); assert.throws(()=>validarPedido(p)); });
test('ignora precio y total manipulados por el navegador',()=>{ const p=base(); const esperado=validarPedido(p); p.totalCentavos=1; p.items[0].precioCentavos=1; assert.deepEqual(validarPedido(p),esperado); });
test('la huella cambia al cambiar la entrega y permanece al variar espacios exteriores',()=>{ const p=base(); const h=validarPedido(p).huella; p.entrega.nombre=' Cliente Prueba '; assert.equal(validarPedido(p).huella,h); p.entrega.numero='124'; assert.notEqual(validarPedido(p).huella,h); });
test('no permite cobrar prueba de $200 con productos o varias unidades',()=>{ const p=base(); p.items.push({sku:'TP-PAGO-200',cantidad:1}); assert.throws(()=>validarPedido(p)); p.items=[{sku:'TP-PAGO-200',cantidad:2}]; assert.throws(()=>validarPedido(p)); });
test('la prueba de pago no necesita domicilio',()=>{ const p=base(); p.items=[{sku:'TP-PAGO-200',cantidad:1}]; delete p.entrega; assert.equal(validarPedido(p).pruebaPago,true); });
test('pedidos de productos requieren dirección y teléfono',()=>{ const p=base(); delete p.entrega.telefono; assert.throws(()=>validarPedido(p)); });
test('envío gratis desde exactamente $50.000',()=>{ assert.equal(costoEnvio(4999999),250000); assert.equal(costoEnvio(5000000),0); });
