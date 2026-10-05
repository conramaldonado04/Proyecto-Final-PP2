# Protección del inicio de sesión

No requiere paquetes nuevos. Reiniciar el backend con `node server.js` desde backend.
Al iniciar se crea el índice TTL de la colección `limites_login` en el MongoDB configurado.

- Cuenta (email normalizado): cinco intentos en una ventana de 15 minutos. Si el quinto falla, pausa de un minuto; después de esa pausa, otro fallo produce cinco minutos, luego quince como máximo.
- Un acceso correcto reinicia el contador de cuenta si no hay reservas posteriores concurrentes. Nunca reinicia el contador de IP.
- Los intentos se reservan antes de bcrypt para impedir que solicitudes simultáneas superen el límite. Una reserva también puede consumirse si el cliente cancela o hay un error posterior del servidor.
- IP: 50 solicitudes a login por ventana de 15 minutos, incluyendo solicitudes inválidas y accesos correctos. La solicitud 51 recibe 429.
- Los intentos rechazados durante una pausa no extienden su duración.
- El estado de cuenta caduca tras 24 horas sin nuevas reservas. La expiración se verifica aunque MongoDB todavía no haya limpiado el registro TTL.
- Emails existentes e inexistentes usan el mismo mecanismo y una comparación bcrypt. No se guardan emails ni contraseñas en el limitador: las claves usan HMAC y SESSION_SECRET.
- Respuesta HTTP 429 con Retry-After y reintentarEn. El frontend muestra una cuenta regresiva; la protección real está en el servidor y sigue vigente al recargar.
- Registro estructurado en la salida del servidor con fecha, IP y resultado. No incluye contraseñas ni emails. Para conservar registros entre reinicios, el entorno de ejecución debe recoger esa salida.
- Si falla MongoDB, el login no continúa sin protección.

La configuración actual escucha en 127.0.0.1 y no confía en cabeceras de proxy. Si más adelante se despliega detrás de un proxy, configurar trust proxy exclusivamente para los proxies reales de la infraestructura; no activarlo indiscriminadamente. Mantener SESSION_SECRET estable y compartido entre instancias para conservar las mismas claves de contador.

Pruebas: desde backend, ejecutar `node --test seguridad/limites-login.test.js`.
Las diez pruebas cubren pausas, ventanas, concurrencia, reinicio, expiración, fallos de almacenamiento y el endpoint Express con bcrypt y almacenamiento simulado. No requieren ni modifican una base de datos real. Queda verificar conexión/permisos e índice TTL contra MongoDB al ejecutar el proyecto.
