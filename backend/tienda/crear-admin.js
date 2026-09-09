// Ejecutar localmente: node tienda/crear-admin.js "tu-email-registrado"
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
if(process.env.DNS_SERVERS) require('node:dns').setServers(process.env.DNS_SERVERS.split(',').map(s=>s.trim()).filter(Boolean));
const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');
(async()=>{
  try {
    const email = process.argv[2]?.trim().toLowerCase();
    if(!email || !email.includes('@')) throw new Error('Indicá el email de tu cuenta ya registrada en la tienda.');
    if(!process.env.MONGO_URI) throw new Error('Falta MONGO_URI.');
    await mongoose.connect(process.env.MONGO_URI,{dbName:'narampol'});
    const resultado = await Usuario.updateOne({email},{$set:{rol:'admin'}});
    if(!resultado.matchedCount) throw new Error('No existe una cuenta con ese email. Registrala primero en la web.');
    console.log('La cuenta indicada ahora es administradora. Recargá la página.');
  } catch(error) { console.error(error.name === 'Error' ? error.message : 'No se pudo actualizar la cuenta: '+error.name); process.exitCode=1; }
  finally { await mongoose.disconnect(); }
})();
