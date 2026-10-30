// Mail de bienvenida al crear una cuenta.
// Requiere:  npm install nodemailer   (dentro de la carpeta backend)
// Y estas variables en backend/.env:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE (true/false), SMTP_USER, SMTP_PASS
//   MAIL_FROM  (opcional, ej.: Naranpol <tu-casilla@gmail.com>)
//   SITIO_URL  (opcional, a dónde lleva el botón; por defecto el sitio local)

const fs = require("node:fs");
const path = require("node:path");

const LOGO = path.join(__dirname, "..", "..", "images", "logo-naranpol.png");

let transporte; // se crea una sola vez
function obtenerTransporte() {
  if (transporte !== undefined) return transporte;

  if (!process.env.SMTP_HOST) {
    transporte = null;
    return transporte;
  }

  const nodemailer = require("nodemailer");
  const puerto = Number(process.env.SMTP_PORT) || 587;

  transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : puerto === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transporte;
}

const esc = (texto) =>
  String(texto).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

function armarMensaje(nombre, urlSitio, conLogo) {
  const nombreHtml = esc(nombre);

  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#fff6e9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff6e9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
        <tr>
          <td style="background:#163b73;padding:32px 32px 24px;text-align:center;">
            <h1 style="margin:0;font-size:28px;line-height:1.2;color:#ffffff;">¡Hola, ${nombreHtml}!</h1>
          </td>
        </tr>
        <tr><td style="background:#f5a100;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:32px 32px 8px;text-align:center;">
            <h2 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#163b73;">¡Te damos la bienvenida a Naranpol!</h2>
            <p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Tu cuenta fue creada correctamente y ya está todo listo para que puedas comenzar a utilizar nuestra plataforma.</p>
            <p style="margin:0 0 28px;font-size:16px;line-height:1.6;">Te invitamos a ingresar y descubrir todo lo que tenemos preparado para vos.</p>
            <a href="${esc(urlSitio)}" target="_blank" rel="noopener" style="display:inline-block;background:#f5a100;color:#163b73;font-weight:700;font-size:16px;letter-spacing:0.5px;text-decoration:none;padding:14px 32px;border-radius:999px;">CONOCÉ NARANPOL</a>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 28px;text-align:center;">
            <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">¡Nos alegra que formes parte de nuestra comunidad!</p>
            <p style="margin:0;font-size:16px;line-height:1.6;">Saludos,<br><strong style="color:#163b73;">Equipo Naranpol</strong></p>
          </td>
        </tr>
        <tr>
          <td style="background:#fff6e9;padding:24px 32px;text-align:center;border-top:4px solid #163b73;">
            ${conLogo ? '<img src="cid:logo-naranpol" alt="Naranpol" height="56" style="height:56px;width:auto;border:0;">' : '<strong style="color:#163b73;font-size:20px;">Naranpol</strong>'}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texto = `¡Hola, ${nombre}!

¡Te damos la bienvenida a Naranpol!

Tu cuenta fue creada correctamente y ya está todo listo para que puedas comenzar a utilizar nuestra plataforma.

Te invitamos a ingresar y descubrir todo lo que tenemos preparado para vos.

CONOCÉ NARANPOL: ${urlSitio}

¡Nos alegra que formes parte de nuestra comunidad!

Saludos,
Equipo Naranpol`;

  return { html, texto };
}

async function enviarBienvenida({ nombre, email }) {
  const smtp = obtenerTransporte();
  if (!smtp) {
    console.warn("Correo de bienvenida no enviado: falta SMTP_HOST en backend/.env");
    return false;
  }

  const urlSitio = process.env.SITIO_URL || "http://127.0.0.1:5500/index.html";
  const conLogo = fs.existsSync(LOGO);
  const { html, texto } = armarMensaje(nombre, urlSitio, conLogo);

  await smtp.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: "¡Bienvenido/a a Naranpol!",
    text: texto,
    html,
    attachments: conLogo
      ? [{ filename: "logo-naranpol.png", path: LOGO, cid: "logo-naranpol" }]
      : [],
  });

  return true;
}

module.exports = { enviarBienvenida };
