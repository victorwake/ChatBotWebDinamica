# Backend

## Configuración

Desde esta carpeta, copiá `.env.example` a `.env` y completá los datos de conexión. `.env` contiene configuración local y no se debe subir a Git. El servidor valida las variables al iniciar y falla explícitamente si faltan o son inválidas.

Variables requeridas: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME`. `DB_CONNECTION_LIMIT`, `PORT` y `CORS_ORIGINS` tienen valores seguros por defecto para desarrollo. En producción, `CORS_ORIGINS` debe enumerar orígenes HTTPS exactos y `DB_PASSWORD` no puede estar vacía.

El registro de pacientes requiere `RESEND_API_KEY`, `RESEND_FROM_EMAIL` y `PUBLIC_APP_URL`. Si falta alguno, `POST /api/v1/auth/register` responde `503` y no crea cuentas. Configurá el remitente verificado en Resend; el enlace lleva el token en el fragmento URL para que no se envíe en requests HTTP ni quede en logs de acceso. No guardes las credenciales de Resend en Git. La recuperación de contraseña y el consentimiento legal aprobado siguen fuera del alcance implementado.

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
- Las respuestas incluyen `X-Request-Id` y cabeceras de seguridad; CORS solo permite los orígenes configurados.
- `/api/v1` aplica un límite por IP configurable mediante `API_RATE_LIMIT_WINDOW_MS` y `API_RATE_LIMIT_MAX`; los health checks no consumen ese límite.
- El JSON entrante está limitado a 1 MiB. El servidor aplica timeouts de cabeceras, request, conexión inactiva y apagado ordenado.

## Autenticación de fase 2

La API `/api/v1/auth` usa sesiones opacas almacenadas en MySQL. La cookie `session` es `HttpOnly`, `SameSite=Lax`, `Path=/` y se marca `Secure` en producción. `GET /api/v1/auth/csrf` crea o reutiliza el contexto de sesión y entrega un token ligado a esa cookie; enviá `X-CSRF-Token` en login, logout y futuras escrituras. La colección Postman guarda automáticamente cookies en su cookie jar.

El login consulta las tablas de cuentas/roles existentes; no hay usuarios demo ni contraseñas incorporados por la API. Acepta hashes Argon2id y hashes bcrypt heredados; al primer login válido con bcrypt, migra el hash a Argon2id. Los nombres de rol en español se traducen a los valores estables del contrato (`patient`, `doctor`, `administrative`, `administrator`). Los intentos están limitados por IP en memoria; para ejecutar varias instancias en producción, configurar un store compartido de rate limit.

El logout invalida la sesión en MySQL y expira la cookie. `/api/v1/auth/me` vuelve a cargar el estado y roles desde la base, de modo que cuentas desactivadas o roles revocados dejan de autorizarse. Las rutas demo `/api/auth`, `/api/patients` y `/api/appointments` siguen sin sesión ni autorización; no deben exponerse como API protegida. Para la aplicación, usar las rutas versionadas `/api/v1`.

`POST /api/v1/auth/register` crea persona, paciente, usuario, rol `patient` y hash del token de verificación en una transacción. Las respuestas a identidades ya existentes son genéricas; no se enlazan fichas por coincidencia. El login rechaza cuentas cuyo email no esté verificado. `POST /api/v1/auth/verify-email` consume el token una sola vez, lo invalida y establece una sesión autenticada. Las migraciones locales 003 (índices normalizados de DNI/email) y 004 (tokens de verificación) deben estar aplicadas antes de usar estas rutas; repetí el preflight agregado y la migración privada por entorno, sin habilitar el autorregistro en producción hasta probar la entrega real de email.

## Invitaciones administrativas de fase 4

`POST /api/v1/auth/registration-invitations` permite a `administrative` y `administrator` invitar una ficha existente o crear una ficha nueva con una invitación. La confirmación CSRF y la autorización se validan en backend; las invitaciones solo asignan el rol `patient`. En fichas existentes, el email debe coincidir con el contacto de la ficha y el personal debe confirmar que verificó identidad y acceso al email según el proceso aprobado. No se asignan contraseñas y la respuesta no permite determinar si una cuenta ya existe.

Los tokens se guardan como SHA-256, vencen a las 24 horas y son de un solo uso. Reenviar revoca cualquier invitación pendiente de esa ficha. `POST /api/v1/auth/accept-invitation` consume el token y crea la cuenta/sesión en una transacción; el enlace lleva el secreto en el fragmento URL y la auditoría omite tokens, email, credenciales y datos clínicos. La migración privada 005 debe aplicarse antes de habilitar estos endpoints. Probar entrega real con Resend y aprobar el proceso de verificación de identidad siguen siendo gates operativos.

El bootstrap del primer administrador es un comando de despliegue, no una ruta pública ni de la UI. Después de compilar el backend, ejecutar `npm run bootstrap:administrator` en `server` únicamente con las variables `BOOTSTRAP_ADMIN_CONFIRM=CREATE_FIRST_ADMINISTRATOR`, `BOOTSTRAP_ADMIN_FIRST_NAME`, `BOOTSTRAP_ADMIN_LAST_NAME`, `BOOTSTRAP_ADMIN_NATIONAL_ID`, `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` inyectadas por un gestor seguro de secretos. El proceso falla si ya existe cualquier cuenta con rol administrador, si hay colisión de identidad/email o si falta el rol. No colocar esos valores en archivos versionados, argumentos de comandos o logs; ejecutar una sola vez en el entorno destino y retirar los secretos temporales.

`GET /api/v1/specialties`, `GET /api/v1/doctors` y `GET /api/v1/appointments/availability` permiten consulta anónima de solo lectura y están sujetos al rate limit global de `/api/v1`. Solo se devuelven referencias activas y espacios disponibles; no se incluyen pacientes, datos de contacto ni agenda privada. La reserva sigue autenticada, toma el paciente desde la sesión para el rol `patient`, revalida el slot dentro de una transacción y rechaza solapamientos con turnos pendientes/confirmados del mismo paciente.

`npm test` compila y ejecuta la suite de integración contra la base de `.env`: crea cuentas sintéticas con identificadores únicos, prueba CSRF/login/sesión/logout, registro/verificación (incluidos expiración, reemisión, uso único y rate limits) y borra los datos que crea al finalizar. La suite suplanta el envío HTTP a Resend; no demuestra la entrega real de correo ni reemplaza la prueba operativa con credenciales del entorno. Usala solamente con una base local de desarrollo, nunca con datos productivos.

## Datos clínicos de fase 5

`/api/v1/consultations` permite a un profesional registrar una atención únicamente para un turno propio iniciado, y guarda el cambio del turno a `completed` en la misma transacción. El profesional puede asociar diagnósticos, tratamientos y recetas a sus consultas. Los pacientes solo pueden consultar su propio historial y los profesionales solo sus atenciones y relaciones asistenciales; los roles administrativos no tienen acceso a endpoints clínicos. No registrar datos reales en ambientes de prueba. `npm test` usa datos clínicos sintéticos y limpia los registros que crea.

## Administración y auditoría de fase 6

Solo el rol `administrator` puede listar y consultar cuentas, cambiar su estado o roles y leer `/api/v1/audit-logs`. El rol de personal administrativo no habilita estas operaciones. Los cambios requieren CSRF y se registran en la misma transacción que la actualización. La última cuenta administradora activa no puede desactivarse ni perder ese rol, y un administrador no puede deshabilitarse ni quitarse a sí mismo el rol.

Las respuestas de auditoría exponen únicamente actor, acción, recurso y fecha; no devuelven snapshots, correos, direcciones IP, agentes de usuario, credenciales ni contenido clínico. Los snapshots internos contienen únicamente el indicador de activación y los nombres de roles anterior/nuevo. El alta de cuentas y la configuración inicial de credenciales siguen siendo parte del procedimiento privado de provisión; la API no acepta ni devuelve contraseñas. El esquema inicial ya incluía almacenamiento para estos eventos, por lo que esta fase no agrega migraciones SQL.

La prueba `server/test/administration-phase6.test.ts` actualiza una cuenta sintética, verifica persistencia y auditoría minimizada y confirma las denegaciones. Ejecutá la suite solo con una base local de pruebas; las fixtures eliminan los eventos sintéticos que crean.

## Endurecimiento y puesta en producción de fase 7

En producción, las rutas demo no versionadas `/api/*` no se montan; solo queda disponible el contrato `/api/v1`. Los orígenes CORS HTTP son rechazados al cargar la configuración productiva. Configurá `TRUST_PROXY_HOPS` con el número exacto de proxies inversos confiables que realmente existan delante del proceso (por defecto `0`); un valor incorrecto puede permitir falsificar IP de cliente. Terminá TLS en el proxy/gateway y no expongas directamente el puerto HTTP del backend a Internet.

El rate limit incluido utiliza memoria local. En producción con más de una instancia, reinicios frecuentes o protección fuerte contra abuso, configurá además rate limiting compartido en el gateway/WAF; no confíes en que los contadores locales sean globales. Ajustá los límites al tráfico esperado y monitorizá respuestas `429`.

El proceso no aplica migraciones al arrancar. Aplicá y verificá una migración explícita antes de desplegar código que la requiera, con backup previo y plan de reversión. Para checklist de release, copias, restauración y limitaciones operativas consultá [DEPLOYMENT.md](./DEPLOYMENT.md).

La suite `npm test` compila y ejecuta integración MySQL, autorización, persistencia, concurrencia de turnos y endurecimiento HTTP. También se validan el contrato OpenAPI y las requests Postman. Ejecutala solo en una base local sintética; no conectes las pruebas de escritura a producción.
