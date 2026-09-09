// Se inyectan los modelos para poder probar la lógica sin acceder a datos reales.
module.exports = async function cancelarPedido({ conexion, Pedido, Producto }, id, usuario) {
  const fallar = (mensaje, status) => { throw Object.assign(new Error(mensaje), { status }); };
  let resultado;
  await conexion.transaction(async sesion => {
    const pedido = await Pedido.findOne({ _id: id, usuario }).session(sesion);
    if (!pedido) fallar('Pedido no encontrado.', 404);
    // Repetir una cancelación devuelve el mismo resultado sin reponer otra vez.
    if (pedido.estado === 'cancelado') { resultado = pedido; return; }
    if (pedido.estado !== 'pendiente_pago' || pedido.pago !== 'pendiente') {
      fallar('Este pedido ya no se puede cancelar desde la web. Si informaste o realizaste un pago, contactá al vendedor.', 409);
    }
    // Esta escritura entra en conflicto con un pago concurrente. MongoDB
    // reintenta la transacción y vuelve a comprobar el estado vigente.
    const actualizado = await Pedido.findOneAndUpdate(
      { _id: id, usuario, estado: 'pendiente_pago', pago: 'pendiente' },
      { $set: { estado: 'cancelado', canceladoEn: new Date() } },
      { new: true, session: sesion, runValidators: true }
    );
    if (!actualizado) fallar('El pedido cambió de estado. Actualizá Mis pedidos.', 409);
    for (const item of pedido.items) {
      if (!Number.isSafeInteger(item.cantidad) || item.cantidad <= 0) {
        fallar('El pedido tiene una cantidad inválida. Contactá al vendedor.', 409);
      }
      const reposicion = await Producto.updateOne(
        { sku: item.sku }, { $inc: { stock: item.cantidad } }, { session: sesion }
      );
      if (reposicion.matchedCount !== 1) {
        fallar('No se pudo reponer un producto. El pedido no se canceló; contactá al vendedor.', 409);
      }
    }
    resultado = actualizado;
  });
  return resultado;
};
