const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

const dns = require("node:dns");

if (process.env.DNS_SERVERS) {
  const servidores = process.env.DNS_SERVERS.split(",")
    .map((servidor) => servidor.trim())
    .filter(Boolean);

  dns.setServers(servidores);
}

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");

// Compatible con las distintas exportaciones de connect-mongo.
const connectMongo = require("connect-mongo");
const MongoStore =
  connectMongo.MongoStore ?? connectMongo.default ?? connectMongo;

const Usuario = require("./models/Usuario");
const authRoutes = require("./routes/auth");

const app = express();

const origenesPermitidos = ["http://127.0.0.1:5500", "http://localhost:5500"];

app.disable("x-powered-by");

app.use(
  cors({
    origin: origenesPermitidos,
    credentials: true,
  }),
);

// Rechaza solicitudes del navegador desde otros sitios.
app.use("/api/auth", (req, res, next) => {
  const origen = req.get("Origin");

  if (origen && !origenesPermitidos.includes(origen)) {
    return res.status(403).json({
      mensaje: "Origen no permitido.",
    });
  }

  if (req.method === "POST" && !req.is("application/json")) {
    return res.status(415).json({
      mensaje: "La solicitud debe enviarse como JSON.",
    });
  }

  next();
});

app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (req, res) => {
  const conectado = mongoose.connection.readyState === 1;

  res.status(conectado ? 200 : 503).json({
    mensaje: "Servidor de Narampol funcionando",
    baseDeDatos: conectado ? "Conectada" : "Desconectada",
  });
});

// Configuración para trabajar localmente con HTTP.
app.locals.sessionCookieName = "narampol.sid";
app.locals.sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: false,
  path: "/",
};

async function iniciarServidor() {
  if (!process.env.MONGO_URI) {
    console.error("Falta MONGO_URI en backend/.env");
    process.exit(1);
  }

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 64) {
    console.error("Falta SESSION_SECRET o no copiaste la clave completa.");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: "narampol",
    });

    await Usuario.init();
    await require("./seguridad/login").iniciarLimitesLogin();

    const store = MongoStore.create({
      client: mongoose.connection.getClient(),
      dbName: "narampol",
      collectionName: "sesiones",
    });

    store.on("error", (error) => {
      console.error("Error del almacén de sesiones:", error.name);
    });

    app.use(
      session({
        name: app.locals.sessionCookieName,
        secret: process.env.SESSION_SECRET,
        store,
        resave: false,
        saveUninitialized: false,
        cookie: {
          ...app.locals.sessionCookieOptions,
          maxAge: 24 * 60 * 60 * 1000,
        },
      }),
    );

    app.use("/api/auth", authRoutes);
    await require("./tienda")(app);
    await require("./admin")(app); // Panel del super usuario (/api/admin)

    app.use((error, req, res, next) => {
      console.error("Error de solicitud:", error.name);

      const estado = error.status === 400 ? 400 : 500;

      res.status(estado).json({
        mensaje:
          estado === 400
            ? "La solicitud no tiene un JSON válido."
            : "Ocurrió un error. Intentá nuevamente.",
      });
    });

    console.log("MongoDB conectado correctamente");

    app.listen(3000, "127.0.0.1", () => {
      console.log("Servidor listo en http://127.0.0.1:3000");
    });
  } catch (error) {
    console.error("No se pudo iniciar el servidor.");
    console.error("Tipo de error:", error.name);
    console.error("Código:", error.code ?? "Sin código");
    process.exit(1);
  }
}

iniciarServidor();
