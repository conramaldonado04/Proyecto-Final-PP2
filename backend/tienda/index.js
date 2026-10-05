const express = require('express');
const mongoose = require('mongoose');
const path = require('node:path');
const fs = require('node:fs');
const Usuario = require('../models/Usuario');
const datos = require('./datos');
const cancelarPedido = require('./cancelar');
const { fallo, validarPedido, costoEnvio } = require('./reglas');
const entero = { validator: Number.isSafeInteger, message: 'Debe ser un entero.' };
const productoSchema = new mongoose.Schema({
  sku: { type: String, required: true, unique: true },
  nombre: { type: String, required: true }, sabor: String, presentacion: String,
  unidades: { type: Number, min: 1, validate: entero },
  precioCentavos: { type: Number, required: true, min: 0, validate: entero },
  stock: { type: Number, required: true, min: 0, validate: entero },
  activo: { type: Boolean, default: true },
  pruebaPago: { type: Boolean, default: false },
  // Agregados para el panel de administración:
  imagen: { type: String, default: '' },                            // ruta dentro de images/productos/
  stockReferencia: { type: Number, min: 1, validate: entero },      // stock ideal (100%); alerta al llegar al 20%
}, { timestamps: true });
const pedidoSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  clave: { type: String, required: true }, huella: { type: String, required: true },
  items: [{ _id: false, sku: String, nombre: String, presentacion: String, cantidad: Number, precioCentavos: Number }],
  entrega: { nombre: String, telefono: String, calle: String, numero: String, localidad: String, codigoPostal: String, referencia: String },
  subtotalCentavos: Number, envioCentavos: Number, totalCentavos: Number,
  estado: { type: String, enum: ['pendiente_pago', 'preparando', 'enviado', 'entregado', 'cancelado'], default: 'pendiente_pago' },
  canceladoEn: Date,
  pago: { type: String, enum: ['pendiente', 'en_revision', 'pagado'], default: 'pendiente' },
  esPrueba: { type: Boolean, default: true }, pruebaPago: Boolean, referenciaPago: String, pagadoEn: Date,
}, { timestamps: true });
pedidoSchema.index({ usuario: 1, clave: 1 }, { unique: true });
const Producto = mongoose.models.Producto || mongoose.model('Producto', productoSchema, 'productos');
const Pedido = mongoose.models.Pedido || mongoose.model('Pedido', pedidoSchema, 'pedidos');
const envolver = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const publico = p => {
  const { _id, items, entrega, subtotalCentavos, envioCentavos, totalCentavos, estado, pago, esPrueba, pruebaPago, referenciaPago, createdAt, canceladoEn } = p;
  return { id: String(_id), items, entrega, subtotalCentavos, envioCentavos, totalCentavos, estado, pago, esPrueba, pruebaPago, referenciaPago, createdAt, canceladoEn };
};

module.exports = async function instalarTienda(app) {
  await Producto.init();
  await Pedido.init();
  // Inserta solo los SKU que faltan: reiniciar NO repone stock ni pisa precios.
  for (const producto of datos) {
    await Producto.updateOne({ sku: producto.sku }, { $setOnInsert: { ...producto, activo: true } }, { upsert: true });
  }
  const router = express.Router();
  router.use((req,res,next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST') {
      const origen = req.get('Origin');
      if (origen && !['http://127.0.0.1:5500','http://localhost:5500'].includes(origen)) return res.status(403).json({ mensaje: 'Origen no permitido.' });
      if (!req.is('application/json')) return res.status(415).json({ mensaje: 'Enviá la solicitud como JSON.' });
    }
    next();
  });
  router.get('/productos', envolver(async (req,res) => {
    res.json({ productos: await Producto.find({ activo: true }).sort({ sku: 1 }).lean(), envio: { costoCentavos: 250000, gratisDesdeCentavos: 5000000 }, esPrueba: true });
  }));
  router.use(envolver(async (req,res,next) => {
    if (!req.session?.usuarioId) return res.status(401).json({ mensaje: 'Ingresá a tu cuenta para continuar.' });
    const usuario = await Usuario.findById(req.session.usuarioId).select('_id rol');
    if (!usuario) return res.status(401).json({ mensaje: 'La cuenta ya no está disponible.' });
    req.clienteId = usuario._id;
    req.esAdmin = usuario.rol === 'admin';
    next();
  }));
  router.get('/pedidos', envolver(async (req,res) => {
    const pedidos = await Pedido.find({ usuario: req.clienteId }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ pedidos: pedidos.map(publico) });
  }));
  router.post('/pedidos', envolver(async (req,res) => {
    const payload = validarPedido(req.body);
    let resultado;
    try {
      await mongoose.connection.transaction(async sesion => {
        const previo = await Pedido.findOne({ usuario: req.clienteId, clave: payload.clave }).session(sesion);
        if (previo) {
          if (previo.huella !== payload.huella) fallo('Este intento ya tiene otros datos. Revisá Mis pedidos antes de iniciar otro.', 409);
          resultado = previo;
          return;
        }
        const items = [];
        let subtotalCentavos = 0;
        for (const item of payload.items) {
          const producto = await Producto.findOneAndUpdate(
            { sku: item.sku, activo: true, stock: { $gte: item.cantidad } },
            { $inc: { stock: -item.cantidad } }, { session: sesion, new: true });
          if (!producto) fallo(`No hay stock suficiente de ${item.sku}. Actualizá el catálogo.`, 409);
          items.push({ sku: producto.sku, nombre: producto.nombre, presentacion: producto.presentacion, cantidad: item.cantidad, precioCentavos: producto.precioCentavos });
          subtotalCentavos += producto.precioCentavos * item.cantidad;
        }
        if (!Number.isSafeInteger(subtotalCentavos)) fallo('El importe supera el máximo permitido.');
        if (payload.pruebaPago && subtotalCentavos !== 20000) fallo('La prueba debe costar exactamente $200. Revisá el precio.', 409);
        const envioCentavos = payload.pruebaPago ? 0 : costoEnvio(subtotalCentavos);
        [resultado] = await Pedido.create([{
          usuario: req.clienteId, clave: payload.clave, huella: payload.huella,
          items, entrega: payload.entrega, subtotalCentavos, envioCentavos,
          totalCentavos: subtotalCentavos + envioCentavos, pruebaPago: payload.pruebaPago,
        }], { session: sesion });
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      resultado = await Pedido.findOne({ usuario: req.clienteId, clave: payload.clave });
      if (!resultado || resultado.huella !== payload.huella) fallo('Revisá Mis pedidos: este intento ya fue procesado con otros datos.', 409);
    }
    res.status(201).json({ pedido: publico(resultado) });
  }));
  router.post('/pedidos/:id/cancelar', envolver(async (req,res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) fallo('Pedido inválido.');
    const pedido = await cancelarPedido(
      { conexion: mongoose.connection, Pedido, Producto }, req.params.id, req.clienteId
    );
    res.json({ pedido: publico(pedido), mensaje: 'Pedido cancelado. Los paquetes volvieron al stock.' });
  }));
  router.get('/pedidos/:id/qr', envolver(async (req,res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) fallo('Pedido inválido.');
    const pedido = await Pedido.findOne({ _id: req.params.id, usuario: req.clienteId });
    if (!pedido) fallo('Pedido no encontrado.', 404);
    if (!pedido.pruebaPago || pedido.totalCentavos !== 20000 || pedido.pago !== 'pendiente' || pedido.estado !== 'pendiente_pago') fallo('El QR solo está habilitado para una prueba pendiente de $200.', 409);
    const archivo = path.join(__dirname, 'qr-mercadopago.png');
    if (!fs.existsSync(archivo)) fallo('Todavía falta configurar el QR de cobro de Mercado Pago.', 503);
    res.type('png').sendFile(archivo);
  }));
  router.post('/pedidos/:id/informar-pago', envolver(async (req,res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) fallo('Pedido inválido.');
    const referencia = req.body?.referencia;
    if (typeof referencia !== 'string' || referencia.trim().length < 3 || referencia.length > 100) fallo('Ingresá el número de operación de Mercado Pago.');
    const pedido = await Pedido.findOneAndUpdate(
      { _id: req.params.id, usuario: req.clienteId, pruebaPago: true, totalCentavos: 20000, pago: 'pendiente', estado: 'pendiente_pago' },
      { $set: { pago: 'en_revision', referenciaPago: referencia.trim() } }, { new: true });
    const resultado = pedido || await Pedido.findOne({ _id: req.params.id, usuario: req.clienteId, pruebaPago: true });
    if (!resultado) fallo('Pedido no encontrado.', 404);
    if (resultado.estado === 'cancelado') fallo('El pedido está cancelado. Si transferiste dinero, contactá al vendedor.', 409);
    res.json({ pedido: publico(resultado), mensaje: 'Pago informado. Falta que el vendedor compruebe la acreditación.' });
  }));
  router.get('/admin/pedidos', envolver(async (req,res) => {
    if (!req.esAdmin) fallo('Acceso reservado al administrador.', 403);
    res.json({ pedidos: (await Pedido.find().sort({ createdAt: -1 }).limit(100).lean()).map(publico) });
  }));
  router.post('/admin/pedidos/:id/confirmar-pago', envolver(async (req,res) => {
    if (!req.esAdmin) fallo('Acceso reservado al administrador.', 403);
    if (!mongoose.isObjectIdOrHexString(req.params.id)) fallo('Pedido inválido.');
    if (req.body?.verificadoEnMercadoPago !== true) fallo('Comprobá el ingreso del dinero en Mercado Pago antes de confirmar.');
    const pedido = await Pedido.findOneAndUpdate({ _id: req.params.id, pruebaPago: true, totalCentavos: 20000, pago: 'en_revision', estado: 'pendiente_pago' },
      { $set: { pago: 'pagado', pagadoEn: new Date(), estado: 'entregado' } }, { new: true });
    if (!pedido) fallo('El pedido no está pendiente de revisión.', 409);
    res.json({ pedido: publico(pedido) });
  }));
  router.use((error,req,res,next) => {
    console.error('Tienda:', error.name, error.code || '');
    res.status(error.status || 500).json({ mensaje: error.status ? error.message : 'No se pudo completar la operación. Revisá Mis pedidos antes de reintentar.' });
  });
  app.use('/api/tienda', router);
  console.log('Tienda lista: catálogo ficticio y prueba de cobro manual de $200.');
};
