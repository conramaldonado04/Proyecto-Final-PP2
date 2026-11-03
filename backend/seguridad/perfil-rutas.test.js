const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Usuario = require('../models/Usuario');
const correo = require('../correo/validar-email');
const bienvenida = require('../correo/bienvenida');

test('rutas: registro de tres perfiles, permisos, sesión y completar cuenta antigua', async () => {
  const originales = { create: Usuario.create, findById: Usuario.findById, findOneAndUpdate: Usuario.findOneAndUpdate, validar: correo.validarEmail, enviar: bienvenida.enviarBienvenida };
  let creado, actualizado, cuenta = { _id: '507f1f77bcf86cd799439011', nombre: 'Ana', email: 'ana@example.com', rol: 'cliente' };
  correo.validarEmail = async email => ({ ok: true, email });
  bienvenida.enviarBienvenida = async () => true;
  Usuario.create = async data => { creado = data; return { _id: '507f1f77bcf86cd799439012', ...data }; };
  Usuario.findById = async () => cuenta;
  Usuario.findOneAndUpdate = async (filtro, cambio) => {
    assert.equal(filtro._id, cuenta._id);
    assert.equal(filtro.tipoCliente, null);
    actualizado = cambio.$set;
    if (cuenta.tipoCliente) return null;
    cuenta = { ...cuenta, ...actualizado }; return cuenta;
  };
  delete require.cache[require.resolve('../routes/auth')];
  const app = express(); app.use(express.json());
  app.use((req,res,next) => { req.session = req.get('x-sesion') ? { usuarioId: cuenta._id } : {}; next(); });
  app.use('/auth', require('../routes/auth'));
  app.use((e,req,res,next) => res.status(500).json({ mensaje: e.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  const url = `http://127.0.0.1:${server.address().port}/auth`;
  const datos = { nombre:'Ana', apellido:'Pérez', dni:'40123456', telefono:'3425551234', email:'ana@example.com', emailConfirmacion:'ana@example.com', password:'Prueba12345', rol:'admin' };
  async function post(ruta, body, sesion = false) {
    const r = await fetch(url+ruta,{method:'POST',headers:{'Content-Type':'application/json',...(sesion?{'x-sesion':'si'}:{})},body:JSON.stringify(body)});
    return { status: r.status, data: await r.json() };
  }
  try {
    for (const tipoCliente of ['minorista','mayorista','distribuidor']) {
      const body = { ...datos, tipoCliente, ...(tipoCliente !== 'minorista' ? {cuit:'30712345671',negocio:'Negocio prueba',domicilioComercial:'San Martín 100, Santa Fe'}:{}), ...(tipoCliente === 'distribuidor'?{zonaDistribucion:'Santa Fe',volumenEstimado:'101 a 500 packs'}:{}) };
      const r = await post('/registro',body);
      assert.equal(r.status,201,JSON.stringify(r.data));
      assert.equal(r.data.usuario.tipoCliente,tipoCliente);
      assert.equal(r.data.usuario.rol,'cliente');
      assert.equal(creado.rol,'cliente');
      assert.equal(r.data.usuario.passwordHash,undefined);
      assert.ok(creado.passwordHash.startsWith('$2b$'));
    }
    assert.equal((await post('/registro',{...datos,tipoCliente:'admin'})).status,400);
    assert.equal((await post('/perfil-comercial',{...datos,tipoCliente:'minorista'})).status,401);
    const antes = await fetch(url+'/sesion',{headers:{'x-sesion':'si'}}).then(r=>r.json());
    assert.equal(antes.usuario.tipoCliente,null);
    assert.equal((await post('/perfil-comercial',{...datos,tipoCliente:'minorista'},true)).status,200);
    assert.equal(actualizado.rol,undefined);
    assert.equal(actualizado.password,undefined);
    assert.equal(actualizado.email,undefined);
    const despues = await fetch(url+'/sesion',{headers:{'x-sesion':'si'}}).then(r=>r.json());
    assert.equal(despues.usuario.tipoCliente,'minorista');
    assert.equal((await post('/perfil-comercial',{...datos,tipoCliente:'minorista'},true)).status,409);
  } finally {
    await new Promise(r=>server.close(r));
    Object.assign(Usuario,{create:originales.create,findById:originales.findById,findOneAndUpdate:originales.findOneAndUpdate});
    correo.validarEmail = originales.validar; bienvenida.enviarBienvenida = originales.enviar;
  }
});
