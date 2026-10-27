# Backend

## Configuración

Desde esta carpeta, copiá `.env.example` a `.env` y completá los datos de conexión. `.env` contiene configuración local y no se debe subir a Git. El servidor valida las variables al iniciar y falla explícitamente si faltan o son inválidas.

Variables requeridas: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME`. `DB_CONNECTION_LIMIT`, `PORT` y `CORS_ORIGINS` tienen valores seguros por defecto para desarrollo.

## Comandos

```powershell
npm install
npm run build
npm run migrate
npm run dev
npm start
npm test
```

`npm start` y `npm run migrate:prod` esperan que exista `.env` en la carpeta `server`. La migración no se ejecuta automáticamente al iniciar el servicio: debe correrse explícitamente antes de desplegar una versión que la necesite.

Si la base ya tiene el esquema creado manualmente y aún no existe historial de migraciones, no ejecutes `npm run migrate`: primero verificá que corresponde exactamente a la migración inicial privada y usá `npm run migrate:baseline`. El baseline solo registra esa migración como aplicada después de comprobar nombres de tablas, columnas, índices explícitos y claves foráneas; no ejecuta el SQL de creación. No se debe usar para una base vacía, con historial previo o con diferencias de esquema.

## Migraciones SQL locales

El ejecutor busca archivos `NNN_nombre.sql` en `DB_MIGRATIONS_DIR` (por defecto `server/migrations`) y falla si la carpeta no contiene migraciones. Por decisión del proyecto, estos archivos permanecen ignorados por Git y deben conservarse y distribuirse por el canal privado de base de datos. No uses datos reales en scripts de prueba.

Cada archivo puede contener instrucciones SQL consecutivas separadas por `;`. El ejecutor admite comentarios SQL comunes, pero no directivas de cliente como `DELIMITER` ni rutinas almacenadas. Aplicar DDL en MySQL puede producir commits implícitos: si una migración falla parcialmente, el ejecutor la deja marcada como iniciada y exige revisión manual en vez de repetirla a ciegas.

Se crea una tabla técnica `schema_migrations` para registrar nombre, checksum y estado. Un archivo ya aplicado no vuelve a ejecutarse; si cambia su checksum, la ejecución se detiene. Las migraciones nuevas se agregan con un número superior, sin editar las ya aplicadas. El comando normal `npm run migrate` rechaza una base que ya tenga tablas pero no historial, para evitar volver a ejecutar la creación sobre un esquema existente.

Los scripts existentes de `scripts_mysql/mysql/` son de preparación inicial/desarrollo y no se ejecutan automáticamente. En particular, el script de creación de base de datos elimina la base existente; no lo ejecutes sobre datos que quieras conservar.

## Monitoreo

- `GET /api/v1/health/live`: confirma que el proceso HTTP está activo.
- `GET /api/v1/health/ready`: confirma que MySQL acepta consultas; devuelve `503` si no está disponible.

## Autenticación de fase 2

La API `/api/v1/auth` usa sesiones opacas almacenadas en MySQL. La cookie `session` es `HttpOnly`, `SameSite=Lax`, `Path=/` y se marca `Secure` en producción. `GET /api/v1/auth/csrf` crea o reutiliza el contexto de sesión y entrega un token ligado a esa cookie; enviá `X-CSRF-Token` en login, logout y futuras escrituras. La colección Postman guarda automáticamente cookies en su cookie jar.

El login consulta las tablas de cuentas/roles existentes; no hay usuarios demo ni contraseñas incorporados por la API. Acepta hashes Argon2id y hashes bcrypt heredados; al primer login válido con bcrypt, migra el hash a Argon2id. Los nombres de rol en español se traducen a los valores estables del contrato (`patient`, `doctor`, `administrative`, `administrator`). Los intentos están limitados por IP en memoria; para ejecutar varias instancias en producción, configurar un store compartido de rate limit.

El logout invalida la sesión en MySQL y expira la cookie. `/api/v1/auth/me` vuelve a cargar el estado y roles desde la base, de modo que cuentas desactivadas o roles revocados dejan de autorizarse. Las rutas demo `/api/auth`, `/api/patients` y `/api/appointments` siguen sin sesión ni autorización; no deben exponerse como API protegida. Para la aplicación, usar las rutas versionadas `/api/v1`.

`npm test` compila y ejecuta el flujo de integración contra la base de `.env`: crea una cuenta de paciente sintética con identificadores únicos, prueba CSRF/login/sesión/logout y borra sus propios datos al finalizar. Usalo solamente con una base local de desarrollo, nunca con datos productivos.

## Datos clínicos de fase 5

`/api/v1/consultations` permite a un profesional registrar una atención únicamente para un turno propio iniciado, y guarda el cambio del turno a `completed` en la misma transacción. El profesional puede asociar diagnósticos, tratamientos y recetas a sus consultas. Los pacientes solo pueden consultar su propio historial y los profesionales solo sus atenciones y relaciones asistenciales; los roles administrativos no tienen acceso a endpoints clínicos. No registrar datos reales en ambientes de prueba. `npm test` usa datos clínicos sintéticos y limpia los registros que crea.
