const { validarCUIT } = require('./validar-datos');
const TIPOS = ['minorista', 'mayorista', 'distribuidor'];
function validarPerfil(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, mensaje: 'Enviá los datos del perfil.' };
  if (!TIPOS.includes(body.tipoCliente)) return { ok: false, mensaje: 'Elegí Minorista, Mayorista o Distribuidor.' };
  const comercial = body.tipoCliente !== 'minorista';
  const perfil = { tipoCliente: body.tipoCliente };
  const campos = {
    telefono: ['el teléfono', 6, 30],
    negocio: ['el nombre del negocio o razón social', 2, 120],
    domicilioComercial: ['el domicilio comercial', 5, 200],
    zonaDistribucion: ['la zona de distribución', 2, 120],
    volumenEstimado: ['el volumen mensual estimado', 1, 80],
  };
  for (const [campo, [nombre, min, max]] of Object.entries(campos)) {
    const necesario = campo === 'telefono' || (comercial && ['negocio', 'domicilioComercial'].includes(campo)) || (body.tipoCliente === 'distribuidor' && ['zonaDistribucion', 'volumenEstimado'].includes(campo));
    if (!necesario) { perfil[campo] = ''; continue; }
    if (typeof body[campo] !== 'string') return { ok: false, mensaje: `Completá ${nombre}.` };
    const valor = body[campo].trim().replace(/\s+/g, ' ');
    if (valor.length < min || valor.length > max || /[<>\x00-\x1f]/.test(valor)) return { ok: false, mensaje: `Revisá ${nombre} (${min} a ${max} caracteres).` };
    if (campo === 'telefono' && !/^\+?[\d ()-]+$/.test(valor)) return { ok: false, mensaje: 'Revisá el teléfono.' };
    perfil[campo] = valor;
  }
  const cuit = validarCUIT(typeof body.cuit === 'string' ? body.cuit : '');
  if (!cuit.ok || (comercial && !cuit.valor)) return { ok: false, mensaje: cuit.ok ? 'El CUIT es obligatorio para mayoristas y distribuidores.' : cuit.mensaje };
  perfil.cuit = cuit.valor || undefined;
  return { ok: true, perfil };
}
// La cuenta antigua no se clasifica sin que su titular complete los datos.
function comprobarCompra(usuario, payload) {
  if (payload.pruebaPago || usuario.rol === 'admin') return;
  if (!TIPOS.includes(usuario.tipoCliente)) throw Object.assign(new Error('Completá tu perfil de compra antes de crear un pedido.'), { status: 409 });
  const packs = payload.items.reduce((s, i) => s + i.cantidad, 0);
  if (usuario.tipoCliente === 'minorista' && packs < 1) throw Object.assign(new Error('La compra minorista requiere al menos 1 pack de 6 botellas.'), { status: 400 });
}
module.exports = { TIPOS, validarPerfil, comprobarCompra };
