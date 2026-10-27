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

## Referencias y disponibilidad

1. Un usuario autenticado puede consultar especialidades y profesionales activos disponibles para reservar.
2. La disponibilidad requiere un rango válido y no mayor a 31 días; rangos inválidos devuelven `422`.
3. Los espacios devueltos identifican su intervalo y profesional; una respuesta de disponibilidad no se interpreta como reserva.

## Turnos

1. Un paciente puede solicitar un turno para sí mismo usando un espacio disponible.
2. Un paciente no puede indicar otro `patientId` al reservar.
3. Personal administrativo puede reservar en nombre de un paciente existente.
4. Si el espacio deja de estar disponible antes de reservar, la API devuelve `409` con `error.code = SLOT_UNAVAILABLE`.
5. Un paciente solo lista y consulta sus turnos; personal administrativo puede consultar los turnos de gestión.
6. Solo personal administrativo confirma un turno solicitado; una transición inválida devuelve `409`.
7. El paciente puede cancelar su propio turno solicitado/confirmado, pero no un turno de otro paciente ni uno completado.
8. Una operación de escritura sin sesión devuelve `401`; sin permiso, `403`; con datos inválidos, `422`.

## Reglas comunes de verificación

- Los errores siguen `ErrorResponse` y tienen `requestId`; nunca contienen SQL, stack traces, secretos ni datos clínicos.
- Los IDs se tratan como cadenas y las fechas/instantes siguen los formatos definidos por OpenAPI.
- Los parámetros de filtro no permiten ampliar los permisos de la sesión.
- Las respuestas no exponen nombres de tablas, columnas ni detalles de persistencia.
