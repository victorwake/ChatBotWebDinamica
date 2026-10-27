# Migraciones privadas

Colocá en esta carpeta los archivos SQL locales con nombres como
`001_initial_schema.sql`. En una base vacía se aplican explícitamente con
`npm run migrate`.
Los archivos `.sql` de esta carpeta están ignorados por Git a propósito y deben
guardarse/distribuirse por el canal privado de base de datos del proyecto.

No edites una migración una vez aplicada. Agregá una nueva con un número superior.
El ejecutor admite SQL común separado por punto y coma; no admite `DELIMITER`,
procedimientos ni triggers.

Para una base ya creada con el esquema inicial, ejecutá una sola vez
`npm run migrate:baseline`. Este comando exige que exista únicamente la migración
inicial y compara sus tablas, columnas, índices declarados y claves foráneas con
la base actual. Si coincide, registra el nombre y checksum como aplicada, sin
ejecutar ninguna sentencia del archivo. Si hay diferencias o ya hay historial,
se detiene sin registrar el baseline. El baseline no sustituye una copia de
seguridad y no compara tipos, nulabilidad, valores predeterminados ni la
definición completa de cada índice.
