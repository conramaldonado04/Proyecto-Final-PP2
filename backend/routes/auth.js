const express = require("express");
const bcrypt = require("bcryptjs");
const Usuario = require("../models/Usuario");

const router = express.Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

function datosPublicos(usuario) {
  return {
    id: usuario._id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
  };
}

// REGISTRO
router.post("/registro", async (req, res) => {
  const { nombre, email, password } = req.body ?? {};

  if (
    typeof nombre !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return res.status(400).json({
      mensaje: "Completá nombre, email y contraseña.",
    });
  }

  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({
      mensaje:
        "La contraseña debe tener al menos 8 caracteres y no superar 72 bytes.",
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const usuario = await Usuario.create({
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      rol: "cliente",
    });

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
router.post("/login", async (req, res, next) => {
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
    const usuario = await Usuario.findOne({
      email: email.trim().toLowerCase(),
    }).select("+passwordHash");

    const coincide = usuario
      ? await bcrypt.compare(password, usuario.passwordHash)
      : false;

    if (!coincide) {
      return res.status(401).json({
        mensaje: "Email o contraseña incorrectos.",
      });
    }

    // Crea un identificador nuevo al iniciar sesión.
    req.session.regenerate((error) => {
      if (error) return next(error);

      req.session.usuarioId = usuario._id.toString();

      req.session.save((error) => {
        if (error) return next(error);

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
