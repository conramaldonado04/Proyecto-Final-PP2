# Panel de administración — guía de conexión

## Qué se agrega / cambia

```
proyectofinal/
├── admin.html                 ← página del panel (se abre con Live Server, como index.html)
├── css/admin.css              ← estilos del panel (mismos colores y tipografías que la web)
├── js/admin.js                ← lógica del panel (validaciones, alertas, llamadas a la API)
├── images/
│   ├── admin-acceso.jpg       ← foto de la pantalla de ingreso
│   └── productos/             ← GALERÍA: toda foto que pongas acá aparece en el formulario
│       ├── naranja-1500.jpg, pomelo-1500.jpg, surtido-1500.jpg, linea-2250.jpg
└── backend/
    ├── server.js              ← MODIFICADO: 1 línea (monta el panel)
    ├── tienda/index.js        ← MODIFICADO: 2 campos nuevos en el producto (imagen, stockReferencia)
    └── admin/
        ├── index.js           ← rutas /api/admin/* (stock, ABM, pedidos, movimientos, imágenes)
        ├── validar.js         ← validaciones campo por campo (sin base de datos)
        └── validar.test.js    ← pruebas: node --test admin/validar.test.js
```

También cambian `js/tienda.js` y `css/tienda.css` para que la tienda muestre los productos
nuevos con su foto, marque "¡Últimos N paquetes!" y el botón de admin lleve al panel.

La línea agregada en `backend/server.js`, justo debajo de la tienda:

```js
await require("./tienda")(app);
await require("./admin")(app); // Panel del super usuario (/api/admin)
```

## Paso a paso

1. **Copiá los archivos** respetando las carpetas (encima de tu proyecto; sólo se reemplaza `server.js`).
2. **Levantá el backend**: `cd backend` → `node server.js`.
   Tenés que ver `Panel de administración listo en /api/admin`.
3. **Creá el super usuario** (una sola vez):
   - Registrate en la web con tu email, como cualquier cliente.
   - `cd backend` → `node tienda/crear-admin.js "tu-email@ejemplo.com"`
4. **Abrí el panel** con Live Server en `http://127.0.0.1:5500/admin.html`.
   Usá `127.0.0.1`, no `localhost`: la API está en `127.0.0.1:3000` y la cookie de sesión
   sólo viaja si el host coincide.
5. Ingresá con esa cuenta. Si ya estabas logueado en la tienda con ella, entra directo.

## Qué hace cada sección

| Sección | Qué permite | Rutas que usa |
|---|---|---|
| Resumen | Pedidos de hoy, en curso, pagos a verificar, facturado, stock bajo (≤ 10) | `GET /api/admin/resumen` |
| Stock | **Alta** (`POST /productos`), **modificación** (`PUT /productos/:sku`), **baja** lógica (`DELETE /productos/:sku`) y reactivar | `/api/admin/productos…` |
| Stock → botón Stock | Ingreso de mercadería, egreso (rotura/merma) o ajuste por conteo | `POST /api/admin/productos/:sku/stock` |
| Pedidos | Lista con filtros y paginado, datos del cliente, dirección, avanzar estado, cancelar reponiendo stock, registrar pago | `/api/admin/pedidos…` |
| Movimientos | Historial de cada cambio de stock: quién, cuándo, por qué | `GET /api/admin/movimientos` |

Flujo de estados de un pedido: `pendiente_pago → preparando → enviado → entregado`
(se puede cancelar mientras está pendiente o preparando y el pago sigue pendiente).
Las pruebas de $200 se siguen cerrando con la ruta que ya tenías
(`/api/tienda/admin/pedidos/:id/confirmar-pago`); el panel la reutiliza.

## Validaciones (alta y edición de productos)

Se validan **todos los campos a la vez** y cada error aparece debajo de su campo, en rojo:

| Campo | Regla |
|---|---|
| SKU | Obligatorio, único, letras/números/guiones entre medio, hasta 40. Ej.: `JUG-NAR-2000-4` |
| Nombre | 2 a 100 caracteres |
| Sabor | 2 a 50 caracteres |
| Presentación | 2 a 100 caracteres |
| Unidades por paquete | Entero de 1 a 1000 |
| Precio | Mayor a $0, hasta 2 decimales. Acepta `7200`, `7.200` o `7.200,50` |
| Stock inicial | Entero de 0 a 1.000.000 |
| Stock ideal | Entero ≥ 1 y no menor que el stock inicial |
| Imagen | Obligatoria en el alta y debe existir en `images/productos/` |

El navegador valida primero; el servidor vuelve a validar lo mismo y, si algo falla,
responde `{ mensaje, campos: { sku: "…", precioCentavos: "…" } }` y el panel marca esos campos.

## Alerta de stock bajo (20 %)

Cada producto tiene un **stock ideal** (100 %). Cuando el stock queda en el **20 % o menos**:
- aparece un aviso rojo arriba del panel (en todas las pestañas) con botón "Cargar stock";
- la pestaña Stock muestra un contador y la fila se marca en rojo con su barra de nivel;
- el panel revisa cada 60 segundos: si un producto *entra* en stock bajo (por ejemplo por
  ventas en la tienda) salta un aviso, y si activaste "Avisarme también en el navegador",
  una notificación del sistema;
- en la tienda, el cliente ve "¡Últimos N paquetes!".

Para los productos que ya existían, el stock ideal se completa solo con su stock actual
al arrancar el servidor. Si ingresa más mercadería que el ideal, ese pasa a ser el nuevo 100 %.

## Decisiones de diseño (para defender en la presentación)

- **La tienda muestra un producto si tiene botella 3D o imagen.** Antes sólo mostraba los dos
  SKU con 3D; por eso los productos cargados desde el panel no aparecían.
- **Baja lógica, no borrado**: los pedidos guardan el SKU, y cancelar un pedido repone stock
  buscando ese SKU. Si se borrara el producto, la cancelación fallaría.
- **El stock no se edita en el formulario del producto**: se mueve con ingreso/egreso/ajuste
  para que quede registro en la colección `movimientos_stock`.
- **Operaciones atómicas**: el ingreso usa `$inc` y el egreso exige `stock >= cantidad` en el
  mismo filtro, así no se pisa con compras simultáneas de la tienda. Cancelar un pedido y
  reponer stock va en una transacción (igual que `tienda/cancelar.js`).
- **Rol verificado en cada solicitud**: si le sacás el rol `admin` a alguien en la base,
  pierde el acceso al instante, sin esperar a que venza la sesión.
- **Mismo control de origen y JSON** que `auth` y `tienda`.

## Colecciones en MongoDB (base `narampol`)

- `productos` y `pedidos`: las mismas de la tienda.
- `movimientos_stock`: **nueva**, se crea sola la primera vez que se registra un movimiento.
  Las ventas hechas desde la tienda no se registran acá (descuentan stock directo en la tienda).

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| "No hay respuesta del servidor" | El backend no está corriendo, o se cayó al conectar a Mongo. |
| Siempre vuelve al login | Abriste `localhost:5500` en vez de `127.0.0.1:5500`. |
| "Acceso reservado al administrador" | Falta correr `crear-admin.js` con ese email. |
| Producto "Oculto: sin imagen" | Editalo y elegí una foto de la galería. |
| No aparece una foto nueva en la galería | Tiene que estar en `images/productos/` y ser .jpg, .png o .webp (nombre sin espacios). |
| "Origen no permitido" | Live Server en otro puerto: agregalo a los orígenes permitidos (server.js, tienda y admin). |
