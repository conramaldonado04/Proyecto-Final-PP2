// Validación de emails para el registro.
// 1) Formato estricto (no alcanza con "algo@algo").
// 2) Sugerencia ante errores de tipeo comunes (gmial.com, hotmial.com…).
// 3) El dominio tiene que existir y recibir correo (registro MX en el DNS).
// No se puede saber si la casilla puntual existe sin enviar un mail de confirmación.

const dns = require("node:dns").promises;

const PARTE_LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const ETIQUETA_DOMINIO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const EXTENSION = /^[A-Za-z]{2,24}$/;

// Mismo criterio de formato para usar también como regex (por ejemplo en modelos).
const FORMATO =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;

const ERRORES_COMUNES = {
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
  "yahoo.con": "yahoo.com",
  "yaho.com": "yahoo.com",
};

function formatoValido(email) {
  if (typeof email !== "string") return false;
  if (email.length > 254) return false;

  const partes = email.split("@");
  if (partes.length !== 2) return false;

  const [local, dominio] = partes;
  if (!local || local.length > 64 || !PARTE_LOCAL.test(local)) return false;
  if (!dominio || dominio.length > 253) return false;

  const etiquetas = dominio.split(".");
  if (etiquetas.length < 2) return false;
  if (!etiquetas.every((etiqueta) => ETIQUETA_DOMINIO.test(etiqueta))) return false;

  return EXTENSION.test(etiquetas[etiquetas.length - 1]);
}

function conTiempoLimite(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => {
      const error = new Error("timeout");
      error.code = "ETIMEOUT";
      setTimeout(() => rechazar(error), ms).unref?.();
    }),
  ]);
}

// Devuelve true si el dominio recibe correo, false si seguro no existe
// y null si no se pudo comprobar (DNS caído, sin internet, etc.).
async function dominioRecibeCorreo(dominio) {
  try {
    const registros = await conTiempoLimite(dns.resolveMx(dominio), 4000);
    // Un MX "nulo" (exchange vacío) indica que el dominio no recibe correo.
    return registros.some((r) => r.exchange && r.exchange !== ".");
  } catch (error) {
    if (error.code === "ENODATA") {
      // Sin MX: el estándar permite usar el registro A del dominio.
      try {
        const direcciones = await conTiempoLimite(dns.resolve4(dominio), 4000);
        return direcciones.length > 0;
      } catch (error2) {
        if (error2.code === "ENODATA" || error2.code === "ENOTFOUND") return false;
        return null;
      }
    }
    if (error.code === "ENOTFOUND") return false;
    return null;
  }
}

async function validarEmail(emailOriginal) {
  const email = String(emailOriginal ?? "").trim().toLowerCase();

  if (!formatoValido(email)) {
    return {
      ok: false,
      mensaje: "Ingresá un email válido, por ejemplo nombre@dominio.com.",
    };
  }

  const dominio = email.split("@")[1];

  if (ERRORES_COMUNES[dominio]) {
    return {
      ok: false,
      mensaje: `¿Quisiste decir ${email.split("@")[0]}@${ERRORES_COMUNES[dominio]}? Revisá el dominio del email.`,
    };
  }

  const recibe = await dominioRecibeCorreo(dominio);
  if (recibe === false) {
    return {
      ok: false,
      mensaje: `El dominio "${dominio}" no existe o no recibe correo. Revisá el email.`,
    };
  }

  return { ok: true, email };
}

module.exports = { validarEmail, formatoValido, FORMATO };
