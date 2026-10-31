const express = require("express");
const bcrypt = require("bcryptjs");
const Usuario = require("../models/Usuario");

const { limitarIP, reservarCuenta, reiniciarCuenta, rechazar, auditar } = require("../seguridad/login");
const { randomBytes } = require("node:crypto");
const { validarEmail } = require("../correo/validar-email");
const {
  validarNombrePropio,
  validarDNI,
  validarCUIT,
} = require("../seguridad/validar-datos");
const { enviarBienvenida } = require("../correo/bienvenida");
// Mismo trabajo bcrypt aunque el email no exista; nunca permite autenticarlo.
const hashSenuelo = bcrypt.hashSync(randomBytes(32).toString("hex"), 12);
const router = express.Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

function datosPublicos(usuario) {
  return {
    id: usuario._id,
    nombre: usuario.nombre,
    apellido: usuario.apellido || "",
    email: usuario.email,
    rol: usuario.rol,
  };
}

// REGISTRO
router.post("/registro", async (req, res) => {
  const { nombre, apellido, dni, cuit, email, emailConfirmacion, password } =
    req.body ?? {};

  if (
    typeof nombre !== "string" ||
    typeof apellido !== "string" ||
    typeof dni !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return res.status(400).json({
      mensaje: "Completá nombre, apellido, DNI, email y contraseña.",
    });
  }

  // Datos personales (se usarán para facturar).
  const nombreOk = validarNombrePropio(nombre, "nombre");
  if (!nombreOk.ok) return res.status(400).json({ mensaje: nombreOk.mensaje });

  const apellidoOk = validarNombrePropio(apellido, "apellido");
  if (!apellidoOk.ok) return res.status(400).json({ mensaje: apellidoOk.mensaje });

  const dniOk = validarDNI(dni);
  if (!dniOk.ok) return res.status(400).json({ mensaje: dniOk.mensaje });

  const cuitOk = validarCUIT(typeof cuit === "string" ? cuit : "");
  if (!cuitOk.ok) return res.status(400).json({ mensaje: cuitOk.mensaje });

  if (
    typeof emailConfirmacion !== "string" ||
    email.trim().toLowerCase() !== emailConfirmacion.trim().toLowerCase()
  ) {
    return res.status(400).json({
      mensaje: "Los emails no coinciden. Volvé a ingresar tu email.",
    });
  }

  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({
      mensaje:
        "La contraseña debe tener al menos 8 caracteres y no superar 72 bytes.",
    });
  }

  // Formato estricto + el dominio del email existe y recibe correo.
  const validacionEmail = await validarEmail(email);
  if (!validacionEmail.ok) {
    return res.status(400).json({ mensaje: validacionEmail.mensaje });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const usuario = await Usuario.create({
      nombre: nombreOk.valor,
      apellido: apellidoOk.valor,
      dni: dniOk.valor,
      ...(cuitOk.valor ? { cuit: cuitOk.valor } : {}),
      email: email.trim().toLowerCase(),
      passwordHash,
      rol: "cliente",
    });

    // El mail de bienvenida no demora ni bloquea el registro: si falla, se registra el error.
    enviarBienvenida({ nombre: usuario.nombre, email: usuario.email }).catch(
      (error) =>
        console.error(
          "No se pudo enviar el mail de bienvenida:",
          error.code || error.name,
        ),
    );

    return res.status(201).json({
      mensaje: "Cliente registrado correctamente.",
      usuario: datosPublicos(usuario),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        mensaje: "Ya existe una cuenta con ese email.",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        mensaje: "Revisá el nombre (2 a 100 caracteres) y el email.",
      });
    }

    console.error("Error al registrar:", error.name);

    return res.status(500).json({
      mensaje: "No se pudo registrar el cliente. Intentá nuevamente.",
    });
  }
});

// INICIAR SESIÓN
router.post("/login", limitarIP, async (req, res, next) => {
  const { email, password } = req.body ?? {};

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    email.trim().length > 254 ||
    !password ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return res.status(400).json({
      mensaje: "Ingresá un email y una contraseña válidos.",
    });
  }

  try {
    const emailNormalizado = email.trim().toLowerCase();
    const reserva = await reservarCuenta(emailNormalizado);
    if (reserva.espera) return rechazar(req, res, reserva.espera);

    const usuario = await Usuario.findOne({ email: emailNormalizado }).select("+passwordHash");
    const coincide = await bcrypt.compare(password, usuario?.passwordHash || hashSenuelo);

    if (!usuario || !coincide) {
      auditar(req, "credenciales_invalidas");
      const espera = Math.ceil((reserva.estado.bloqueo - Date.now()) / 1000);
      if (espera > 0) return rechazar(req, res, espera);
      return res.status(401).json({
        mensaje: "Email o contraseña incorrectos.",
      });
    }

    await reiniciarCuenta(reserva);

    // Crea un identificador nuevo al iniciar sesión.
    req.session.regenerate((error) => {
      if (error) return next(error);

      req.session.usuarioId = usuario._id.toString();

      req.session.save((error) => {
        if (error) return next(error);

        auditar(req, "exito");
        res.json({
          mensaje: "Sesión iniciada correctamente.",
          usuario: datosPublicos(usuario),
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

// CONSULTAR LA SESIÓN ACTUAL
router.get("/sesion", async (req, res, next) => {
  if (!req.session.usuarioId) {
    return res.status(401).json({
      mensaje: "No hay una sesión iniciada.",
    });
  }

  try {
    const usuario = await Usuario.findById(req.session.usuarioId);

    if (!usuario) {
      return req.session.destroy((error) => {
        if (error) return next(error);

        res.clearCookie(
          req.app.locals.sessionCookieName,
          req.app.locals.sessionCookieOptions,
        );

        res.status(401).json({
          mensaje: "La cuenta ya no está disponible.",
        });
      });
    }

    res.json({
      usuario: datosPublicos(usuario),
    });
  } catch (error) {
    next(error);
  }
});

// CERRAR SESIÓN
router.post("/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie(
      req.app.locals.sessionCookieName,
      req.app.locals.sessionCookieOptions,
    );

    res.json({
      mensaje: "Sesión cerrada correctamente.",
    });
  });
});

module.exports = router;
