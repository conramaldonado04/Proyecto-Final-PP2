const { test } = require('node:test');
const assert = require('node:assert/strict');
const { crearLimitador, VENTANA } = require('./limites-login');
function memoria() {
  const docs = new Map();
  return {
    docs,
    createIndex: async () => {},
    findOne: async q => structuredClone(docs.get(q._id) || null),
    insertOne: async d => { if (docs.has(d._id)) throw Object.assign(new Error(), { code: 11000 }); docs.set(d._id, structuredClone(d)); },
    updateOne: async (q, u) => { const d = docs.get(q._id); if (!d || d.revision !== q.revision) return { matchedCount: 0 }; docs.set(q._id, { ...d, ...structuredClone(u.$set) }); return { matchedCount: 1 }; },
    deleteOne: async q => { if (docs.get(q._id)?.revision === q.revision) docs.delete(q._id); },
  };
}
function entorno() {
  let ahora = 1000000;
  const db = memoria();
  return { db, l: crearLimitador(db, 'secreto-prueba', () => ahora), avanzar: ms => ahora += ms };
}
test('cinco intentos y pausas de 1, 5 y 15 minutos; máximo 15', async () => {
  const { l, avanzar } = entorno();
  for (let i=0;i<5;i++) assert.equal((await l.reservar('cuenta','a')).espera,0);
  for (const segundos of [60,300,900,900]) {
    assert.equal((await l.reservar('cuenta','a')).espera,segundos);
    avanzar(segundos*1000);
    assert.equal((await l.reservar('cuenta','a')).espera,0);
  }
});
test('bloqueado no extiende la pausa', async () => {
  const {l,avanzar}=entorno();for(let i=0;i<5;i++)await l.reservar('cuenta','a');
  avanzar(30000);assert.equal((await l.reservar('cuenta','a')).espera,30);
});
test('50 solicitudes por IP y recuperación de la ventana', async () => {
  const {l,avanzar}=entorno();for(let i=0;i<50;i++)assert.equal((await l.reservar('ip','a')).espera,0);
  assert.equal((await l.reservar('ip','a')).espera,900);avanzar(VENTANA);
  assert.equal((await l.reservar('ip','a')).espera,0);
});
test('cuentas separadas y reinicio después del éxito', async () => {
  const {l}=entorno();let r;for(let i=0;i<5;i++)r=await l.reservar('cuenta','a');
  assert.equal((await l.reservar('cuenta','b')).espera,0);await l.reiniciar(r);
  assert.equal((await l.reservar('cuenta','a')).estado.cantidad,1);
});
test('100 solicitudes simultáneas permiten solo cinco reservas por cuenta', async () => {
  const {l}=entorno();const rs=await Promise.all(Array.from({length:100},()=>l.reservar('cuenta','a')));
  assert.equal(rs.filter(r=>!r.espera).length,5);
});
test('éxito anterior no borra intentos posteriores', async () => {
  const {l}=entorno();const r=await l.reservar('cuenta','a');await l.reservar('cuenta','a');await l.reiniciar(r);
  assert.equal((await l.reservar('cuenta','a')).estado.cantidad,3);
});
test('persistencia al recrear servicio y sin email en claves', async () => {
  const {l,db}=entorno();for(let i=0;i<5;i++)await l.reservar('cuenta','a@example.com');
  const otro=crearLimitador(db,'secreto-prueba',()=>1000000);
  assert.equal((await otro.reservar('cuenta','a@example.com')).espera,60);
  assert.ok(!JSON.stringify([...db.docs]).includes('a@example.com'));
});
test('expiración lógica funciona antes de la limpieza TTL', async () => {
  const {l,avanzar}=entorno();for(let i=0;i<5;i++)await l.reservar('cuenta','a');avanzar(86400000);
  assert.equal((await l.reservar('cuenta','a')).estado.cantidad,1);
});
test('fallos de almacenamiento rechazan la operación', async () => {
  const l=crearLimitador({findOne:async()=>{throw new Error('offline')}},'x');
  await assert.rejects(l.reservar('ip','a'),/offline/);
});

test('ruta real: cuenta inexistente, 429, normalización, éxito y sesión', async () => {
  const mongoose = require('mongoose');
  const express = require('express');
  const bcrypt = require('bcryptjs');
  const Usuario = require('../models/Usuario');
  const db=memoria();
  const originalCollection=mongoose.connection.collection;
  const originalFind=Usuario.findOne;
  mongoose.connection.collection=()=>db;
  process.env.SESSION_SECRET='secreto-prueba';
  await require('./login').iniciarLimitesLogin();
  const hash=await bcrypt.hash('password123',12);
  Usuario.findOne=({email})=>({select:async()=>email==='real@example.com'?{_id:'123',nombre:'Prueba',email,rol:'cliente',passwordHash:hash}:null});
  const app=express();app.use(express.json());
  app.use((req,res,next)=>{req.session={regenerate:cb=>cb(),save:cb=>cb()};next()});
  app.use('/auth',require('../routes/auth'));
  app.use((e,req,res,next)=>res.status(500).json({mensaje:'error'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const url=`http://127.0.0.1:${server.address().port}/auth/login`;
  async function login(email,password='incorrecta'){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});return {status:r.status,data:await r.json(),retry:r.headers.get('retry-after')}}
  try {
    for(let i=0;i<4;i++)assert.equal((await login(' NO@EXAMPLE.COM ')).status,401);
    const blocked=await login('no@example.com');assert.equal(blocked.status,429);assert.ok(Number(blocked.retry)>0);
    assert.equal((await login('no@example.com','password123')).status,429);
    for(let i=0;i<4;i++)assert.equal((await login('real@example.com')).status,401);
    const ok=await login(' REAL@example.com ','password123');assert.equal(ok.status,200);assert.equal(ok.data.usuario.id,'123');
    assert.equal((await login('real@example.com')).status,401);
  } finally {
    await new Promise(r=>server.close(r));mongoose.connection.collection=originalCollection;Usuario.findOne=originalFind;
  }
});
