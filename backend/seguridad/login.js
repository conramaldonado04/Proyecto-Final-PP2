const mongoose = require('mongoose');
const { crearLimitador } = require('./limites-login');
let limitador;
async function iniciarLimitesLogin() {
  const coleccion = mongoose.connection.collection('limites_login');
  await coleccion.createIndex({ expira: 1 }, { expireAfterSeconds: 0 });
  limitador = crearLimitador(coleccion, process.env.SESSION_SECRET);
}
function auditar(req, resultado) {
  console.info(JSON.stringify({ evento: 'login', fecha: new Date().toISOString(), ip: req.ip, resultado }));
}
function rechazar(req, res, segundos) {
  auditar(req, 'limitado');
  res.set('Retry-After', String(segundos));
  return res.status(429).json({
    mensaje: `Demasiados intentos. Volvé a intentar en ${segundos} segundos.`,
    reintentarEn: segundos,
  });
}
async function limitarIP(req, res, next) {
  try {
    // Express no confía en X-Forwarded-For por defecto. No usar esa cabecera directamente.
    const reserva = await limitador.reservar('ip', req.ip || req.socket.remoteAddress || 'desconocida');
    if (reserva.espera) return rechazar(req, res, reserva.espera);
    next();
  } catch (error) { next(error); }
}
module.exports = {
  iniciarLimitesLogin, limitarIP, rechazar, auditar,
  reservarCuenta: email => limitador.reservar('cuenta', email),
  reiniciarCuenta: reserva => limitador.reiniciar(reserva),
};
