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

El resto de las rutas actuales de demostración continúa separado del contrato versionado hasta fases posteriores.
