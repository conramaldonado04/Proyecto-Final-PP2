// Validación de los datos personales que se piden al registrarse.
// Sirven para emitir facturas más adelante (nombre, apellido, DNI y, si corresponde, CUIT/CUIL).

const NOMBRE = /^\p{L}(?:[\p{L}'’ .-]*\p{L})?$/u;

function limpiarEspacios(texto) {
  return String(texto ?? "").trim().replace(/\s+/g, " ");
}

// Nombre o apellido: letras (con tildes), espacios, guion y apóstrofe. 2 a 50 caracteres.
function validarNombrePropio(valor, etiqueta) {
  const texto = limpiarEspacios(valor);
  if (texto.length < 2 || texto.length > 50 || !NOMBRE.test(texto)) {
    return { ok: false, mensaje: `Revisá el ${etiqueta}: usá solo letras (2 a 50 caracteres).` };
  }
  return { ok: true, valor: texto };
}

// DNI argentino: 7 u 8 dígitos (acepta puntos y espacios al escribirlo).
function validarDNI(valor) {
  const digitos = String(valor ?? "").replace(/[.\s]/g, "");
  if (!/^\d{7,8}$/.test(digitos) || /^0+$/.test(digitos)) {
    return { ok: false, mensaje: "Ingresá un DNI válido de 7 u 8 números, sin puntos." };
  }
  return { ok: true, valor: digitos };
}

// CUIT/CUIL: 11 dígitos, prefijo válido y dígito verificador correcto. Es opcional.
function validarCUIT(valor) {
  const digitos = String(valor ?? "").replace(/[-.\s]/g, "");
  if (!digitos) return { ok: true, valor: "" };

  const mensaje = "El CUIT/CUIL no es válido. Ingresá los 11 números, con o sin guiones.";
  if (!/^\d{11}$/.test(digitos)) return { ok: false, mensaje };
  if (!["20", "23", "24", "27", "30", "33", "34"].includes(digitos.slice(0, 2))) {
    return { ok: false, mensaje };
  }

  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, peso, i) => acc + peso * Number(digitos[i]), 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : 11 - resto;

  if (verificador === 10 || verificador !== Number(digitos[10])) {
    return { ok: false, mensaje };
  }
  return { ok: true, valor: digitos };
}

module.exports = { validarNombrePropio, validarDNI, validarCUIT, limpiarEspacios };
