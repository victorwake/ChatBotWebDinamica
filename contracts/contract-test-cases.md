# Casos de aceptación del contrato HTTP

Estos casos verifican comportamiento observable del MVP sin depender del lenguaje,
framework o base de datos del backend. Los datos y credenciales son ficticios.
La autenticación `/api/v1/auth` cuenta con pruebas de integración en
`server/test/auth-flow.test.ts`; los casos de recursos se ejecutan al implementar
sus fases.

## Health checks

1. `GET /api/v1/health/live` devuelve `200` con `status = ok` aunque MySQL no esté disponible.
2. `GET /api/v1/health/ready` devuelve `200` cuando MySQL responde y `503` con `error.code = DEPENDENCY_UNAVAILABLE` cuando no responde.
3. Las respuestas HTTP incluyen `X-Request-Id`; los errores no exponen detalles de conexión ni credenciales.

## Sesión y autenticación

1. `GET /api/v1/auth/csrf` devuelve un token CSRF no vacío.
2. `POST /api/v1/auth/login` sin token CSRF es rechazado.
3. Login válido devuelve el usuario, establece la cookie de sesión `HttpOnly` y no incluye el valor de la cookie en el JSON.
4. Después de login se invalida el token CSRF preautenticación; el cliente obtiene uno nuevo antes de una escritura autenticada.
5. Login inválido devuelve `401` con `error.code` estable y sin indicar si el email existe.
6. `GET /api/v1/auth/me` sin sesión devuelve `401`; con sesión devuelve el usuario y sus roles.
7. Logout con sesión y CSRF válido devuelve `204`; las solicitudes posteriores con esa sesión reciben `401`.
8. Los roles locales se devuelven normalizados como `patient`, `doctor`, `administrative` o `administrator`.
9. Un guard de rol rechaza con `403` a un usuario sin el perfil requerido; un paciente solo supera el guard para su propio `patientId`.

## Pacientes

1. Personal administrativo puede listar pacientes; la respuesta está paginada y no contiene datos clínicos.
2. Un paciente no puede listar otros pacientes (`403`).
3. Un paciente autenticado puede consultar y actualizar campos permitidos de su propio registro.
4. Un paciente no puede consultar ni modificar el registro de otra persona (`403` o `404`, según la política documentada).
5. Personal administrativo puede crear pacientes; enviar un documento duplicado produce `409`.
6. Campos desconocidos o inválidos no se aceptan como si fueran válidos.
7. El detalle de paciente solo se muestra al propio paciente o a personal administrativo; la búsqueda nunca incluye documentos ni notas.
8. La edición del paciente persiste únicamente los campos permitidos; los errores no exponen SQL ni restricciones internas.

## Coberturas

1. El paciente puede consultar, agregar y actualizar únicamente coberturas de su propio perfil; el personal administrativo puede gestionarlas.
2. Un paciente no puede consultar ni modificar las coberturas de otra persona (`403`).
3. La cobertura requiere una entidad proveedora activa y fechas válidas; un rango invertido devuelve `422`.
4. No se puede duplicar la misma afiliación ni registrar más de una cobertura principal activa por paciente (`409`).
5. Una cobertura creada puede consultarse de nuevo y sus cambios persisten.

## Referencias y disponibilidad

1. Un usuario autenticado puede consultar especialidades y profesionales activos disponibles para reservar.
2. Los listados de especialidades y profesionales excluyen registros inactivos; un filtro de especialidad inválido devuelve `422`.
3. La disponibilidad requiere un rango positivo con zona horaria y no mayor a 31 días; rangos inválidos devuelven `422`.
4. Los espacios se generan desde horarios y excepciones en `America/Argentina/Buenos_Aires`, excluyen turnos solicitados/confirmados y nunca se interpretan como una reserva.

## Turnos

1. Un paciente puede solicitar un turno para sí mismo usando un espacio disponible.
2. Un paciente no puede indicar otro `patientId` al reservar.
3. Personal administrativo puede reservar en nombre de un paciente existente.
4. Si el espacio deja de estar disponible antes de reservar, la API devuelve `409` con `error.code = SLOT_UNAVAILABLE`.
5. Solicitudes concurrentes por el mismo espacio permiten una única reserva; las demás devuelven `409` con `error.code = SLOT_UNAVAILABLE`.
6. Un paciente solo lista y consulta sus turnos; profesionales solo los asociados a su perfil; personal administrativo puede consultar todos los turnos.
7. Solo personal administrativo confirma un turno solicitado; una transición inválida devuelve `409`.
8. El paciente puede cancelar o reprogramar su propio turno solicitado/confirmado; personal administrativo puede hacerlo por cualquier paciente.
9. Los cambios de estado, reservas y reprogramaciones se registran en el historial dentro de la misma transacción.
10. Turnos completados y ausentes se devuelven como `completed` y `no_show`; no se permiten transiciones desde estados terminales.
11. Una operación de escritura sin sesión devuelve `401`; sin permiso, `403`; con datos inválidos, `422`.

## Atención e historial clínico

1. Solo el profesional asignado puede registrar una atención de un turno propio iniciado; turno y consulta se actualizan de forma atómica.
2. No se registra una segunda consulta para el mismo turno ni se atienden turnos futuros, cancelados o ausentes.
3. El profesional que registró la consulta y el paciente propietario pueden consultar el detalle; un paciente distinto recibe `404`.
4. Solo el profesional autor de la atención puede asociar diagnósticos, tratamientos y recetas; los campos inválidos devuelven `422`.
5. Una receta se guarda con sus ítems en una sola transacción y su número lo genera el servidor.
6. El paciente solo puede consultar su propio historial. El profesional solo consulta atenciones propias de un paciente con relación asistencial vigente.
7. Los roles administrativos no pueden listar ni consultar consultas, diagnósticos, tratamientos, recetas o historial clínico (`403`).
8. Las listas están paginadas y filtradas por fechas sin que parámetros enviados por el cliente amplíen el alcance de autorización.
9. Logs y errores no incluyen contenido clínico, SQL, credenciales ni stack traces.

## Administración y auditoría

1. Solo el rol `administrator` puede listar, consultar o actualizar cuentas y consultar eventos de auditoría; `administrative`, pacientes y profesionales reciben `403`.
2. Los listados de cuentas están paginados y solo contienen identidad administrativa mínima, estado de cuenta y roles; nunca incluyen hashes, credenciales ni datos clínicos.
3. Las escrituras requieren sesión y CSRF válido. Los roles deben pertenecer al contrato y no pueden repetirse; los filtros y cuerpos inválidos devuelven `422`.
4. Cambios de estado y roles persisten en una transacción y quedan auditados con actor, acción, recurso y fecha.
5. La respuesta de auditoría no devuelve snapshots de cambios, correo, IP, agente de usuario, credenciales ni datos clínicos.
6. La última cuenta administradora activa no puede desactivarse ni perder el rol de administrador; un administrador tampoco puede quitarse a sí mismo ese rol o desactivar su cuenta.
7. El alta de cuentas y la configuración inicial de credenciales siguen el procedimiento privado de provisión; no se aceptan contraseñas mediante los endpoints administrativos.

## Reglas comunes de verificación

- Los errores siguen `ErrorResponse` y tienen `requestId`; nunca contienen SQL, stack traces, secretos ni datos clínicos.
- Los IDs se tratan como cadenas y las fechas/instantes siguen los formatos definidos por OpenAPI.
- Los parámetros de filtro no permiten ampliar los permisos de la sesión.
- Las respuestas no exponen nombres de tablas, columnas ni detalles de persistencia.
