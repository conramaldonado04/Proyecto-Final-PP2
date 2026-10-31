const { createHmac, randomUUID } = require('node:crypto');
const VENTANA = 15 * 60 * 1000;
const PAUSAS = [60_000, 300_000, 900_000];
const RETENCION = 24 * 60 * 60 * 1000;

// Se reserva antes de comparar la contraseña: los intentos simultáneos también cuentan.
function siguiente(estado, tipo, ahora) {
  let s = { ...estado };
  if (!s.vence || s.vence <= ahora) s = { cantidad: 0, nivel: 0, inicio: ahora, bloqueo: 0 };
  if (s.bloqueo > ahora) return { espera: Math.ceil((s.bloqueo - ahora) / 1000) };
  if (tipo === 'ip' && ahora - s.inicio >= VENTANA) s = { cantidad: 0, nivel: 0, inicio: ahora, bloqueo: 0 };
  if (tipo === 'cuenta' && !s.nivel && ahora - s.inicio >= VENTANA) s.cantidad = 0, s.inicio = ahora;
  s.cantidad += 1;
  if (tipo === 'ip' && s.cantidad >= 50) s.bloqueo = s.inicio + VENTANA;
  if (tipo === 'cuenta' && s.cantidad >= 5) {
    s.bloqueo = ahora + PAUSAS[Math.min(s.nivel, PAUSAS.length - 1)];
    s.nivel = Math.min(s.nivel + 1, PAUSAS.length);
  }
  s.vence = ahora + RETENCION;
  return { estado: s, espera: 0 };
}

function crearLimitador(coleccion, secreto, reloj = Date.now) {
  const clave = (tipo, valor) => tipo + ':' + createHmac('sha256', secreto).update(valor).digest('hex');
  async function reservar(tipo, valor) {
    const _id = clave(tipo, valor);
    for (let intento = 0; intento < 100; intento++) {
      const actual = await coleccion.findOne({ _id });
      const ahora = reloj();
      const cambio = siguiente(actual?.estado || {}, tipo, ahora);
      if (cambio.espera) return cambio;
      const revision = randomUUID();
      const nuevo = { estado: cambio.estado, revision, expira: new Date(cambio.estado.vence) };
      if (!actual) {
        try { await coleccion.insertOne({ _id, ...nuevo }); }
        catch (error) { if (error.code === 11000) continue; throw error; }
      } else {
        const resultado = await coleccion.updateOne({ _id, revision: actual.revision }, { $set: nuevo });
        if (!resultado.matchedCount) continue;
      }
      return { espera: 0, _id, revision, estado: cambio.estado };
    }
    // Bajo contención extrema se rechaza; nunca se deja pasar sin límite.
    return { espera: 1 };
  }
  async function reiniciar(reserva) {
    // No borra reservas de otros intentos que llegaron después.
    await coleccion.deleteOne({ _id: reserva._id, revision: reserva.revision });
  }
  return { reservar, reiniciar };
}
module.exports = { crearLimitador, siguiente, VENTANA, PAUSAS };
