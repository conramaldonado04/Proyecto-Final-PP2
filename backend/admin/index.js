// Rutas del panel de administración (super usuario).
// Se monta en /api/admin desde server.js, DESPUÉS de la tienda, porque reutiliza
// los modelos Producto y Pedido que registra tienda/index.js.
const express = require('express');
const mongoose = require('mongoose');
const fs = require('node:fs/promises');
const path = require('node:path');
const Usuario = require('../models/Usuario');
const {
  fallo, validarSku, validarProducto, validarMovimiento, validarCambioEstado, esStockBajo,
  IMAGEN, PORCENTAJE_ALERTA,
} = require('./validar');

const ORIGENES = ['http://127.0.0.1:5500', 'http://localhost:5500'];
const POR_PAGINA = 25;
// Carpeta pública de imágenes de productos (la que sirve Live Server).
const CARPETA_IMAGENES = path.join(__dirname, '..', '..', 'images', 'productos');
// Imagen inicial para los productos que ya existían y se venden en la tienda.
const IMAGENES_INICIALES = {
  'JUG-NAR-1500-6': 'images/productos/naranja-1500.jpg',
  'JUG-POM-1500-6': 'images/productos/pomelo-1500.jpg',
};

// Stock bajo = 20 % o menos del stock ideal (misma regla que validar.js, en consulta de Mongo).
const FILTRO_STOCK_BAJO = {
  activo: true,
  $expr: { $lte: [{ $multiply: ['$stock', 100] }, { $multiply: ['$stockReferencia', PORCENTAJE_ALERTA] }] },
};

async function imagenExiste(ruta) {
  if (!ruta) return true;
  try {
    await fs.access(path.join(CARPETA_IMAGENES, path.basename(ruta)));
    return true;
  } catch {
    return false;
  }
}

// Agrega a cada producto el porcentaje de stock y si está bajo.
function conAlerta(p) {
  const o = typeof p.toObject === 'function' ? p.toObject() : p;
  const ref = o.stockReferencia || 0;
  return {
    ...o,
    porcentajeStock: ref ? Math.round((o.stock / ref) * 100) : null,
    stockBajo: esStockBajo(o.stock, ref),
  };
}

// Historial de cada cambio de stock hecho desde el panel (quién, cuándo, por qué).
const movimientoSchema = new mongoose.Schema({
  sku: { type: String, required: true, index: true },
  tipo: { type: String, enum: ['alta', 'ingreso', 'egreso', 'ajuste', 'cancelacion_pedido'], required: true },
  delta: { type: Number, required: true },
  stockAnterior: Number,
  stockNuevo: Number,
  motivo: String,
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  pedido: { type: mongoose.Schema.Types.ObjectId, ref: 'Pedido' },
}, { timestamps: { createdAt: true, updatedAt: false } });
const Movimiento = mongoose.models.MovimientoStock
  || mongoose.model('MovimientoStock', movimientoSchema, 'movimientos_stock');

const envolver = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function pedidoAdmin(p) {
  const cliente = p.usuario && typeof p.usuario === 'object' && p.usuario.email
    ? { id: String(p.usuario._id), nombre: p.usuario.nombre, email: p.usuario.email }
    : { id: String(p.usuario ?? ''), nombre: '(cuenta eliminada)', email: '' };
  return {
    id: String(p._id), cliente, items: p.items, entrega: p.entrega,
    subtotalCentavos: p.subtotalCentavos, envioCentavos: p.envioCentavos, totalCentavos: p.totalCentavos,
    estado: p.estado, pago: p.pago, pruebaPago: !!p.pruebaPago, esPrueba: p.esPrueba,
    referenciaPago: p.referenciaPago, pagadoEn: p.pagadoEn, canceladoEn: p.canceladoEn,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}

// Convierte errores de validación de Mongoose al mismo formato { campo: mensaje }.
function erroresMongoose(error) {
  return Object.fromEntries(Object.entries(error.errors || {}).map(([campo, e]) => [campo, e.message]));
}

function idValido(id) {
  if (!mongoose.isObjectIdOrHexString(id)) fallo('Identificador inválido.');
  return id;
}

module.exports = async function instalarAdmin(app) {
  if (!mongoose.models.Producto || !mongoose.models.Pedido) {
    throw new Error('Montá la tienda antes que el panel de administración.');
  }
  const Producto = mongoose.model('Producto');
  const Pedido = mongoose.model('Pedido');
  await Movimiento.init();

  // Completa datos que antes no existían (sólo en productos que no los tienen; no pisa nada).
  for (const p of await Producto.find({ $or: [{ stockReferencia: { $exists: false } }, { stockReferencia: null }] })) {
    await Producto.updateOne({ _id: p._id }, { $set: { stockReferencia: Math.max(p.stock, 1) } });
  }
  for (const [sku, imagen] of Object.entries(IMAGENES_INICIALES)) {
    await Producto.updateOne({ sku, $or: [{ imagen: { $exists: false } }, { imagen: '' }] }, { $set: { imagen } });
  }

  const router = express.Router();

  // 1) Cabeceras y controles de origen (mismo criterio que auth y tienda).
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      const origen = req.get('Origin');
      if (origen && !ORIGENES.includes(origen)) return res.status(403).json({ mensaje: 'Origen no permitido.' });
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
        return res.status(415).json({ mensaje: 'Enviá la solicitud como JSON.' });
      }
    }
    next();
  });

  // 2) Sólo usuarios con rol "admin". Se consulta en cada pedido: si le quitás
  //    el rol a alguien en la base, pierde el acceso al instante.
  router.use(envolver(async (req, res, next) => {
    if (!req.session?.usuarioId) return res.status(401).json({ mensaje: 'Iniciá sesión como administrador.' });
    const usuario = await Usuario.findById(req.session.usuarioId).select('_id rol nombre');
    if (!usuario) return res.status(401).json({ mensaje: 'La cuenta ya no está disponible.' });
    if (usuario.rol !== 'admin') return res.status(403).json({ mensaje: 'Acceso reservado al administrador.' });
    req.admin = usuario;
    next();
  }));

  // ───────────── RESUMEN ─────────────
  router.get('/resumen', envolver(async (req, res) => {
    const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
    const [porEstado, ventas, enRevision, pedidosHoy, stockBajo, productosActivos] = await Promise.all([
      Pedido.aggregate([{ $group: { _id: '$estado', cantidad: { $sum: 1 } } }]),
      Pedido.aggregate([
        { $match: { estado: { $ne: 'cancelado' }, pruebaPago: { $ne: true } } },
        { $group: { _id: null, total: { $sum: '$totalCentavos' } } },
      ]),
      Pedido.countDocuments({ pago: 'en_revision', estado: { $ne: 'cancelado' } }),
      Pedido.countDocuments({ createdAt: { $gte: inicioHoy } }),
      Producto.find(FILTRO_STOCK_BAJO).sort({ stock: 1 }).select('sku nombre presentacion stock stockReferencia imagen').lean(),
      Producto.countDocuments({ activo: true }),
    ]);
    res.json({
      pedidosPorEstado: Object.fromEntries(porEstado.map(e => [e._id, e.cantidad])),
      ventasCentavos: ventas[0]?.total ?? 0,
      pagosEnRevision: enRevision,
      pedidosHoy,
      productosActivos,
      stockBajo: stockBajo.map(conAlerta),
      porcentajeAlerta: PORCENTAJE_ALERTA,
    });
  }));

  // ───────────── PRODUCTOS (ABM) ─────────────
  // Lista todos, incluidos los dados de baja (la tienda sólo muestra activos con imagen o 3D).
  router.get('/productos', envolver(async (req, res) => {
    const productos = await Producto.find().sort({ activo: -1, sku: 1 }).lean();
    res.json({ productos: productos.map(conAlerta), porcentajeAlerta: PORCENTAJE_ALERTA });
  }));

  // Imágenes disponibles: todo archivo .jpg/.png/.webp que pongas en images/productos/
  router.get('/imagenes', envolver(async (req, res) => {
    let archivos = [];
    try {
      archivos = await fs.readdir(CARPETA_IMAGENES);
    } catch {
      fallo('No existe la carpeta images/productos. Creala junto a index.html.', 500);
    }
    const imagenes = archivos.map(a => `images/productos/${a}`).filter(r => IMAGEN.test(r)).sort();
    res.json({ imagenes });
  }));

  // ALTA
  router.post('/productos', envolver(async (req, res) => {
    const datos = validarProducto(req.body, { alta: true });
    if (!(await imagenExiste(datos.imagen))) {
      fallo('Revisá la imagen.', 400, { imagen: 'Esa imagen no está en images/productos. Actualizá la galería.' });
    }
    let creado;
    try {
      creado = await Producto.create({ ...datos, activo: datos.activo ?? true, pruebaPago: false });
    } catch (error) {
      if (error.code === 11000) fallo('Ya existe un producto con ese SKU.', 409, { sku: `Ya existe un producto con el SKU ${datos.sku}. Elegí otro.` });
      if (error.name === 'ValidationError') fallo('Revisá los campos marcados.', 400, erroresMongoose(error));
      throw error;
    }
    // El historial no debe impedir el alta: si falla, el producto igual queda creado.
    await Movimiento.create({
      sku: creado.sku, tipo: 'alta', delta: creado.stock, stockAnterior: 0, stockNuevo: creado.stock,
      motivo: 'Alta de producto', usuario: req.admin._id,
    }).catch(e => console.error('Admin: no se registró el movimiento de alta', e.name));
    res.status(201).json({ producto: conAlerta(creado), mensaje: `Producto ${creado.sku} creado.` });
  }));

  // MODIFICACIÓN (datos comerciales; el stock se cambia por /stock para dejar registro)
  router.put('/productos/:sku', envolver(async (req, res) => {
    const sku = validarSku(req.params.sku);
    const datos = validarProducto(req.body);
    const actual = await Producto.findOne({ sku });
    if (!actual) fallo('Producto no encontrado.', 404);
    // La prueba de cobro exige $200 exactos en tienda/index.js.
    if (actual.pruebaPago && datos.precioCentavos !== 20000) {
      fallo('Revisá el precio.', 409, { precioCentavos: 'El producto de prueba de pago debe costar exactamente $200.' });
    }
    if (!(await imagenExiste(datos.imagen))) {
      fallo('Revisá la imagen.', 400, { imagen: 'Esa imagen no está en images/productos. Actualizá la galería.' });
    }
    let producto;
    try {
      producto = await Producto.findOneAndUpdate({ sku }, { $set: datos }, { new: true, runValidators: true });
    } catch (error) {
      if (error.name === 'ValidationError') fallo('Revisá los campos marcados.', 400, erroresMongoose(error));
      throw error;
    }
    res.json({ producto: conAlerta(producto), mensaje: 'Producto actualizado.' });
  }));

  // BAJA LÓGICA: el producto deja de verse en la tienda pero se conserva,
  // porque los pedidos lo referencian por SKU y cancelar un pedido repone su stock.
  router.delete('/productos/:sku', envolver(async (req, res) => {
    const sku = validarSku(req.params.sku);
    const producto = await Producto.findOneAndUpdate({ sku }, { $set: { activo: false } }, { new: true });
    if (!producto) fallo('Producto no encontrado.', 404);
    res.json({ producto: conAlerta(producto), mensaje: 'Producto dado de baja. Ya no aparece en la tienda.' });
  }));

  router.post('/productos/:sku/reactivar', envolver(async (req, res) => {
    const sku = validarSku(req.params.sku);
    const producto = await Producto.findOneAndUpdate({ sku }, { $set: { activo: true } }, { new: true });
    if (!producto) fallo('Producto no encontrado.', 404);
    res.json({ producto: conAlerta(producto), mensaje: 'Producto reactivado.' });
  }));

  // CARGA / MOVIMIENTO DE STOCK
  router.post('/productos/:sku/stock', envolver(async (req, res) => {
    const sku = validarSku(req.params.sku);
    const { tipo, cantidad, motivo } = validarMovimiento(req.body);
    let producto;
    await mongoose.connection.transaction(async sesion => {
      let anterior;
      if (tipo === 'ajuste') {
        anterior = await Producto.findOneAndUpdate({ sku }, { $set: { stock: cantidad } }, { new: false, session: sesion });
      } else {
        const delta = tipo === 'ingreso' ? cantidad : -cantidad;
        const filtro = tipo === 'egreso' ? { sku, stock: { $gte: cantidad } } : { sku };
        anterior = await Producto.findOneAndUpdate(filtro, { $inc: { stock: delta } }, { new: false, session: sesion });
        if (!anterior && tipo === 'egreso' && await Producto.exists({ sku }).session(sesion)) {
          fallo('No hay tanto stock para descontar.', 409, { cantidad: 'No hay tanto stock para descontar.' });
        }
      }
      if (!anterior) fallo('Producto no encontrado.', 404);
      const stockNuevo = tipo === 'ajuste' ? cantidad : anterior.stock + (tipo === 'ingreso' ? cantidad : -cantidad);
      if (stockNuevo > 1_000_000) fallo('El stock no puede superar 1.000.000 de paquetes.', 400, { cantidad: 'El stock total no puede superar 1.000.000 de paquetes.' });
      // Si entra más mercadería que el stock ideal, ese pasa a ser el nuevo 100 %.
      if (stockNuevo > (anterior.stockReferencia || 0)) {
        await Producto.updateOne({ sku }, { $max: { stockReferencia: stockNuevo } }, { session: sesion });
      }
      await Movimiento.create([{
        sku, tipo, delta: stockNuevo - anterior.stock, stockAnterior: anterior.stock, stockNuevo,
        motivo, usuario: req.admin._id,
      }], { session: sesion });
      producto = await Producto.findOne({ sku }).session(sesion);
    });
    const p = conAlerta(producto);
    res.json({
      producto: p,
      mensaje: p.stockBajo
        ? `Stock actualizado. ¡Atención! Quedan ${p.stock} paquetes (${p.porcentajeStock} % del stock ideal).`
        : 'Stock actualizado.',
    });
  }));

  router.get('/movimientos', envolver(async (req, res) => {
    const filtro = {};
    if (req.query.sku) filtro.sku = validarSku(String(req.query.sku));
    const movimientos = await Movimiento.find(filtro).sort({ createdAt: -1 }).limit(200)
      .populate('usuario', 'nombre email').lean();
    res.json({ movimientos });
  }));

  // ───────────── PEDIDOS ─────────────
  router.get('/pedidos', envolver(async (req, res) => {
    const filtro = {};
    const { estado, pago, tipo } = req.query;
    if (typeof estado === 'string' && estado) filtro.estado = estado;
    if (typeof pago === 'string' && pago) filtro.pago = pago;
    if (tipo === 'prueba') filtro.pruebaPago = true;
    if (tipo === 'productos') filtro.pruebaPago = { $ne: true };
    const pagina = Math.max(1, Math.min(1000, Number.parseInt(req.query.pagina, 10) || 1));
    const [pedidos, total] = await Promise.all([
      Pedido.find(filtro).sort({ createdAt: -1 }).skip((pagina - 1) * POR_PAGINA).limit(POR_PAGINA)
        .populate('usuario', 'nombre email').lean(),
      Pedido.countDocuments(filtro),
    ]);
    res.json({ pedidos: pedidos.map(pedidoAdmin), pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)), total });
  }));

  router.get('/pedidos/:id', envolver(async (req, res) => {
    const pedido = await Pedido.findById(idValido(req.params.id)).populate('usuario', 'nombre email').lean();
    if (!pedido) fallo('Pedido no encontrado.', 404);
    res.json({ pedido: pedidoAdmin(pedido) });
  }));

  // Avanzar estado: pendiente_pago → preparando → enviado → entregado (o cancelar).
  router.patch('/pedidos/:id/estado', envolver(async (req, res) => {
    const id = idValido(req.params.id);
    const nuevo = req.body?.estado;
    let resultado;
    await mongoose.connection.transaction(async sesion => {
      const pedido = await Pedido.findById(id).session(sesion);
      if (!pedido) fallo('Pedido no encontrado.', 404);
      validarCambioEstado(pedido, nuevo);
      const cambios = { estado: nuevo };
      if (nuevo === 'cancelado') cambios.canceladoEn = new Date();
      // El filtro con el estado actual evita pisar un cambio simultáneo (p. ej. el cliente cancelando).
      resultado = await Pedido.findOneAndUpdate(
        { _id: id, estado: pedido.estado, pago: pedido.pago }, { $set: cambios }, { new: true, session: sesion });
      if (!resultado) fallo('El pedido cambió mientras lo editabas. Actualizá la lista.', 409);
      if (nuevo === 'cancelado') {
        for (const item of pedido.items) {
          const antes = await Producto.findOneAndUpdate(
            { sku: item.sku }, { $inc: { stock: item.cantidad } }, { new: false, session: sesion });
          if (!antes) fallo(`No existe el producto ${item.sku} para reponer stock. No se canceló.`, 409);
          await Movimiento.create([{
            sku: item.sku, tipo: 'cancelacion_pedido', delta: item.cantidad,
            stockAnterior: antes.stock, stockNuevo: antes.stock + item.cantidad,
            motivo: `Cancelación del pedido ${String(id).slice(-8).toUpperCase()} desde el panel`,
            usuario: req.admin._id, pedido: id,
          }], { session: sesion });
        }
      }
    });
    await resultado.populate('usuario', 'nombre email');
    res.json({ pedido: pedidoAdmin(resultado.toObject()), mensaje: 'Estado actualizado.' });
  }));

  // Registrar cobro de un pedido común (transferencia, efectivo al entregar, etc.).
  router.post('/pedidos/:id/marcar-pagado', envolver(async (req, res) => {
    const id = idValido(req.params.id);
    const pedido = await Pedido.findOneAndUpdate(
      { _id: id, pruebaPago: { $ne: true }, estado: { $ne: 'cancelado' }, pago: { $ne: 'pagado' } },
      { $set: { pago: 'pagado', pagadoEn: new Date() } }, { new: true },
    ).populate('usuario', 'nombre email');
    if (!pedido) fallo('El pedido no existe, está cancelado, ya estaba pagado o es una prueba de $200.', 409);
    res.json({ pedido: pedidoAdmin(pedido.toObject()), mensaje: 'Pago registrado.' });
  }));

  router.use((error, req, res, next) => {
    // En la consola del servidor queda el detalle para poder diagnosticar.
    if (!error.status || error.status >= 500) console.error('Admin:', error.name, error.code || '', error.message);
    res.status(error.status || 500).json({
      mensaje: error.status ? error.message : 'No se pudo completar la operación. Mirá la consola del servidor.',
      ...(error.campos && { campos: error.campos }),
    });
  });

  app.use('/api/admin', router);
  console.log('Panel de administración listo en /api/admin');
};
