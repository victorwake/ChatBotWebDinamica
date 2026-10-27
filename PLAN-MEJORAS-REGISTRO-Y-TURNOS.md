# Plan de mejoras: registro de pacientes y solicitud de turnos

**Estado:** propuesta para revisar antes de implementar  
**Fecha:** 27/10/2026

## 1. Objetivo

Permitir que una persona nueva encuentre disponibilidad y solicite un turno sin que el sistema la deje bloqueada en el login, mientras se crea de forma segura una cuenta de paciente ligada a su ficha. También cubrir el mantenimiento administrativo de pacientes, documentos, coberturas y cuentas, incluyendo el alta controlada de administradores.

La aplicación debe seguir comunicándose con el backend exclusivamente mediante `/api/v1` y el contrato OpenAPI. El frontend no debe depender de MySQL ni de la tecnología concreta del servidor.

## 2. Estado actual verificado

- La disponibilidad, la consulta y la reserva de turnos requieren una sesión autenticada. `POST /appointments` reserva para un paciente ya asociado a la sesión o para un paciente indicado por personal administrativo.
- `POST /auth/register` no existe en el contrato ni en el router de autenticación.
- `POST /patients` crea un perfil, no una cuenta, y está limitado a `administrative` y `administrator`.
- El paciente puede actualizar teléfono, email y domicilio. El DNI no se admite en la actualización actual.
- El contrato permite varias coberturas por paciente y agregar/actualizar coberturas. La baja lógica puede representarse con `active=false` y fecha de vigencia final; no existe borrado físico.
- La UI permite listar y actualizar roles/estado de cuentas, pero no crear cuentas.
- La cobertura requiere un `providerId`; falta una ruta de catálogo para que el usuario elija por nombre en lugar de ingresar un identificador interno.
- La reserva ya valida la disponibilidad dentro de una transacción. No hay un mecanismo contractual de retención temporal del horario.
- El backend y el esquema privado tienen entidades de personas, pacientes, usuarios y coberturas. Cualquier cambio de persistencia debe verificarse contra las migraciones locales antes de decidir si hacen falta columnas o tablas nuevas.

## 3. Propuesta de experiencia

### Flujo recomendado: disponibilidad pública y registro al confirmar

Se recomienda un flujo híbrido entre registro previo y “guest”:

1. La persona puede explorar especialidades, profesionales y horarios sin autenticarse, usando endpoints públicos de solo lectura que no revelen información de pacientes.
2. Al seleccionar un horario, el sistema solicita iniciar sesión o crear una cuenta de paciente. Si la persona se registra, ingresa sus datos identificatorios y de contacto.
3. El backend crea en una única transacción la persona, el paciente, la cuenta con rol `patient` y su asociación. No se asignan perfiles privilegiados desde este flujo.
4. Al terminar el registro, la sesión queda iniciada y la aplicación retoma la intención de reserva.
5. Antes de reservar, la API vuelve a validar el horario y crea el turno de manera atómica. Si otro usuario lo ocupó, informa el conflicto y ofrece volver a buscar; no confirma una reserva hasta recibir respuesta satisfactoria.
6. La cobertura se puede completar durante el registro o más adelante, de acuerdo con la política que defina el consultorio. La selección de un horario no debe implicar que una obra social esté aceptada para ese profesional hasta que esa relación esté configurada y verificada.

Este flujo reduce la fricción sin permitir reservas anónimas difíciles de vincular a una identidad. No se propone bloquear horarios durante 5–10 minutos en la primera entrega: agrega estado expirado y carreras adicionales. La reserva transaccional actual más una nueva comprobación al confirmar es suficiente como primera etapa.

### Acceso de personal

- `administrative` puede registrar y corregir fichas de pacientes y administrar sus coberturas según sus permisos.
- `administrator` administra cuentas, roles y auditoría; no obtiene acceso a información clínica por ese rol.
- Crear una cuenta de paciente desde la recepción debe ser una operación explícita y separada de crear una ficha. No se debe asignar una contraseña conocida por el operador.
- El primer administrador se provisiona fuera del registro público mediante un procedimiento operativo controlado. Las altas posteriores de administradores requieren autorización administrativa explícita, invitación de un solo uso, aceptación del titular y auditoría.

## 4. Alcance y límites

### Incluido

- Registro de cuenta de paciente vinculado a su perfil y autenticación posterior al alta.
- Alta administrativa de paciente y mecanismo seguro para que el paciente active su propia cuenta.
- Consulta pública acotada de especialidades, profesionales y disponibilidad.
- Continuidad desde selección de horario hasta login/registro y reserva.
- Edición del perfil y flujo auditado para corregir DNI y otros identificadores sensibles.
- Varias coberturas, baja lógica por fecha/estado, cambio de cobertura y selección desde un catálogo.
- Invitación y alta controlada de cuentas, incluido el rol `administrator`.
- Reglas de autorización, CSRF, límites de intentos, auditoría y pruebas de privacidad.

### Fuera del primer alcance

- Inicio de sesión con Mi Argentina, ReNaPer, una prepaga u otro proveedor de identidad hasta contar con contrato y credenciales oficiales.
- Gestión de grupo familiar, tutores y reservas para menores o adultos a cargo. Requiere modelar relaciones, consentimientos y autorizaciones antes de exponerlo.
- Carga de fotos de DNI, credenciales u órdenes. Requiere definir almacenamiento privado, retención, análisis de archivos, permisos y borrado seguro.
- Mensajes de WhatsApp, correo transaccional o recordatorios hasta seleccionar un proveedor y configurar su operación.
- Afirmar cumplimiento legal por un cambio de código. La política de datos, consentimiento, retención y obligaciones aplicables deben ser revisadas por responsables legales/operativos.
- Compatibilidad de un profesional con cada obra social/plan, hasta que el consultorio mantenga ese nomenclador y sus reglas.
- Retención temporal del turno, a menos que la operación del consultorio requiera explícitamente un plazo de checkout.

## 5. Requisitos funcionales y de seguridad

- **REQ-001 — Descubrir turnos:** una persona no autenticada puede consultar únicamente catálogos y disponibilidad pública autorizada; nunca pacientes, cuentas, agenda privada ni historia clínica.
- **REQ-002 — Alta de paciente:** crear cuenta, perfil y asociación de forma atómica; la cuenta nueva recibe exclusivamente el rol `patient`.
- **REQ-003 — Reservar luego del alta:** retomar un turno seleccionado y confirmar solo luego de que la API vuelva a validar la disponibilidad.
- **REQ-004 — Vincular identidades existentes:** no asociar automáticamente una ficha existente solo por coincidencia de DNI, email, nombre o fecha de nacimiento. Resolver reclamos de identidad por verificación adecuada o revisión del personal, sin revelar a terceros si el DNI/email está registrado.
- **REQ-005 — Administrar pacientes:** personal autorizado puede registrar una ficha y emitir una invitación para que su titular active una cuenta; nunca conoce ni fija la contraseña del paciente.
- **REQ-006 — Editar identidad y contacto:** teléfono/email/domicilio se actualizan por el titular según política; DNI y datos identificatorios sensibles requieren un flujo de corrección controlado, con validación de duplicados, actor, fecha y motivo auditables.
- **REQ-007 — Gestionar coberturas:** el paciente puede mantener varias coberturas si lo permite la política; agregar, modificar, cambiar principalidad y dar de baja de forma lógica conservando vigencias históricas. No borrar referencias usadas por turnos.
- **REQ-008 — Crear cuentas privilegiadas:** el registro público nunca permite asignar roles administrativos. El primer `administrator` se provisiona fuera del flujo público; otras altas privilegiadas requieren invitación de un administrador autorizado y auditoría.
- **REQ-009 — Privacidad y robustez:** todas las escrituras exigen CSRF y autenticación donde corresponda; respuestas de registro no permiten enumerar identidades; las escrituras son idempotentes o resistentes a duplicados y los permisos se verifican en servidor.

## 6. Contrato API a evolucionar

Diseñar primero OpenAPI y luego implementar servidor y cliente. Las rutas siguientes son una propuesta de nombres; se deben ajustar al estilo definitivo del contrato.

| Operación propuesta | Acceso | Propósito |
|---|---|---|
| `GET /specialties`, `GET /doctors`, `GET /appointments/availability` | Público, solo lectura y rate limit | Permitir que una persona nueva encuentre opciones. Definir qué información de profesionales/agenda puede publicarse. |
| `POST /auth/register` | Público + CSRF + rate limit | Crear cuenta de paciente y perfil vinculado, iniciar sesión y devolver `CurrentUser`. El DTO no acepta `roles`, `active`, `patientId` ni IDs internos. |
| `POST /auth/registration-invitations` | Personal administrativo + CSRF | Crear ficha o invitar al titular de una ficha existente sin establecer su contraseña. |
| `POST /auth/accept-invitation` | Token de un uso + CSRF | Verificar invitación, establecer credencial y asociar la cuenta a la ficha correcta. |
| `PATCH /patients/{patientId}` | Titular para campos permitidos; personal autorizado para correcciones | Separar campos ordinarios de cambios de DNI/identidad; registrar auditoría de cambios sensibles. |
| `GET /coverage-providers` | Público o sesión, según decisión operativa | Catálogo de entidades activas con identificadores de API, nombres y, si existe fuente confiable, planes disponibles. |
| `GET/POST /patients/{patientId}/coverage` | Titular de la ficha o personal autorizado | Listar y agregar coberturas. |
| `PUT /patients/{patientId}/coverage/{coverageId}` | Titular de la ficha o personal autorizado | Actualizar datos, vigencia, principalidad o baja lógica (`active=false`). |
| `POST /users` o `POST /admin-invitations` | Solo `administrator` | Crear/invitar cuentas privilegiadas sin exponer passwords ni aceptar escalamiento desde clientes públicos. Considerar mantener el primer administrador solo como operación de bootstrap. |
| `POST /appointments` | Paciente autenticado o personal autorizado | Reservar con identidad asociada a la sesión; volver a validar disponibilidad de manera atómica. |

Cada operación debe documentar DTO estricto, errores `401/403/409/422`, CSRF, idempotencia cuando aplique, límites de tasa y reglas de auditoría. El contrato de registro no debe distinguir en mensajes públicos entre “email/DNI existente” y otros conflictos que permitan enumeración; el flujo de resolución debe ser privado.

## 7. Fases de implementación

### Fase 0 — Decisiones operativas y de identidad

1. Confirmar si el catálogo y la disponibilidad pueden ser públicos y qué datos del profesional se muestran.
2. Definir campos obligatorios de registro: se propone nombre, apellido, DNI, fecha de nacimiento, móvil y email; domicilio opcional. Evitar pedir datos sin uso definido.
3. Definir qué hacer ante DNI/email existente, ficha duplicada, paciente menor de edad y persona sin email.
4. Definir verificación de email/teléfono, proveedor de mensajería y política de activación. No simular una verificación inexistente.
5. Definir quién corrige DNI, qué evidencia/motivo registra y quién puede invitar a activar cuenta.
6. Definir alta de `administrator`, recuperación de cuenta, requisitos de MFA (si se adopta) y bootstrap inicial.
7. Validar política de coberturas: si es opcional, cuándo se solicita y si una obra social es necesaria para reservar.
8. Revisar privacidad, retención, consentimiento y obligaciones con las personas responsables del consultorio.

**Salida:** decisiones aprobadas y escenarios de aceptación; ningún comportamiento de negocio sensible queda implícito.

### Fase 1 — Contrato y modelo de datos

1. Actualizar `contracts/openapi.yaml` con registro, invitaciones, catálogo y reglas de actualización de pacientes/coberturas.
2. Revisar `server/migrations/` y los datos/esquema locales no versionados antes de decidir migraciones. Verificar claves únicas de DNI/email, asociación `users`–`personas`–`pacientes`, password hash, y referencias de cobertura desde turnos.
3. Diseñar cambios mínimos de persistencia y un procedimiento de migración/rollback, sin publicar en Git scripts que el proyecto mantiene privados.
4. Asegurar índice/constraint único para identidad normalizada de paciente, tratando duplicados históricos como tarea de reconciliación y no como error que se resuelve automáticamente.
5. Definir auditoría de cambios de DNI, roles, estado y cobertura sin duplicar en logs datos de salud o credenciales.
6. Actualizar los modelos y tipos del cliente TypeScript generados o mantenidos desde el contrato.

**Gate:** revisión de contrato, seguridad, migración y compatibilidad backend/frontend antes de comenzar los flujos.

### Fase 2 — Registro y autenticación de pacientes (P1)

1. Implementar `POST /auth/register` con validación estricta, rate limit, hash de credencial, CSRF y creación transaccional de persona, paciente, usuario, rol `patient` y asociación.
2. Implementar flujo de activación/verificación acordado; si depende de proveedor externo, mantenerlo detrás de interfaz configurable y no habilitar registro de producción sin la entrega real.
3. Resolver los conflictos de identidad sin revelar datos de cuentas ya existentes ni enlazar automáticamente perfiles no verificados.
4. Implementar formulario y ruta de registro, errores de validación, consentimiento y accesibilidad.
5. Añadir “Crear cuenta” desde `/login` y desde el momento en que la persona intenta confirmar una reserva.
6. Probar alta, login, logout, CSRF, rate limit, duplicados, expiración/reuso de token y persistencia de asociación.

**Aceptación:** una persona nueva puede completar el alta y terminar autenticada como `patient`; no puede asignarse otro rol ni consultar fichas ajenas.

### Fase 3 — Búsqueda pública y reserva continuada (P1)

1. Definir endpoints públicos de solo lectura para especialidades, profesionales y disponibilidad, con rate limit y minimización de datos.
2. Permitir navegar la disponibilidad sin sesión y conservar localmente solo la selección no sensible (slot ID/criterios) durante la transición a login/registro. No guardar datos personales o clínicos en `localStorage`.
3. Al volver autenticado, reconsultar/validar el slot y reservar a partir de `patientId` de la sesión. Nunca aceptar del navegador un paciente diferente para el rol `patient`.
4. Reutilizar la transacción existente de reserva y sus controles de concurrencia; respuestas `409` vuelven a disponibilidad.
5. Revisar duplicados de turno: definir regla de producto exacta (mismo paciente, profesional/especialidad, ventana temporal y estados que cuentan) antes de agregar restricciones.
6. No filtrar disponibilidad por cobertura hasta tener catálogo confiable y relación profesional–plan; presentar la cobertura como dato informativo si todavía no existe esa validación.

**Aceptación:** una persona nueva completa la secuencia explorar → elegir horario → registrarse → confirmar; la sesión y el chat persisten, y si el horario ya no está disponible se ofrece una alternativa sin mostrar una reserva falsa.

### Fase 4 — Alta administrativa e invitaciones (P1)

1. Extender el alta administrativa de paciente para registrar contacto y emitir invitación segura, sin asignar contraseña ni imprimir un secreto.
2. Implementar aceptación de invitación, expiración, un solo uso, invalidación y manejo de reenvío con respuesta que no permita enumerar cuentas.
3. Crear una cuenta desde una ficha existente solo después de comprobar que quien la reclama está autorizado a vincularse.
4. Añadir UI para personal `administrative`; auditoría y permisos validados también en el backend.
5. Implementar el bootstrap del primer administrador como comando de despliegue/documentación operativa, con secretos fuera del repositorio. Altas posteriores solo por un flujo privilegiado y auditado.

**Aceptación:** recepción puede registrar un paciente e invitarlo; no conoce su contraseña. Ningún endpoint público permite crear o promover cuentas administrativas.

### Fase 5 — Perfil, DNI y coberturas (P1/P2)

1. Permitir al titular editar contacto y domicilio.
2. Implementar corrección de DNI/identidad con permiso administrativo, validación de formato y duplicados, motivo obligatorio y auditoría. Mostrar al paciente el resultado permitido sin exponer la auditoría interna.
3. Incorporar el catálogo de obras sociales/prepagas y reemplazar la entrada manual de `providerId` en la interfaz.
4. Completar la UI de múltiples coberturas: agregar, elegir principal, editar afiliado/titular, cambiar vigencia y dar de baja lógicamente. No borrar coberturas históricas asociadas a turnos.
5. Definir qué ocurre al cambiar la cobertura principal y con turnos futuros ya reservados; el cambio no debe reescribir el historial de turnos.
6. Si se requiere plan, autorizar, orden o fotos, agregarlos solo luego de definir catálogo, política de archivos, retención, permisos y validación del consultorio.

**Aceptación:** se pueden conservar varias coberturas con períodos no ambiguos; una cobertura dada de baja queda inactiva y no se usa en nuevas reservas, y los turnos previos mantienen su referencia histórica.

### Fase 6 — Administración de cuentas y hardening (P2)

1. Añadir alta por invitación de cuentas no privilegiadas y de `administrator` según la política aprobada.
2. Evitar que cambiar un rol de cuenta convierta una cuenta sin asociación en paciente/doctor accidentalmente.
3. Auditar altas, invitaciones, aceptaciones, correcciones de DNI, bajas y cambios de rol. No registrar contraseñas, tokens ni contenido clínico.
4. Revisar autenticación de doble factor para administración, recuperación segura, protección contra fuerza bruta y alertas operativas.
5. Documentar recuperación y desactivación de administradores sin dejar el sistema sin administrador activo.

**Aceptación:** solo operadores autorizados pueden otorgar privilegios; el primer administrador tiene origen operativo trazable; todas las operaciones sensibles dejan auditoría minimizada.

### Fase 7 — Migración, pruebas y liberación

1. Preparar migración de esquema compatible y respaldo/rollback; detectar y resolver duplicados existentes con un procedimiento manual auditado.
2. Ejecutar pruebas de API y UI para los roles anónimo, paciente, administrativo, doctor y administrador.
3. Cubrir condiciones de carrera de reserva, DNI duplicado, registro concurrente, token reutilizado, invitación expirada, cobertura vencida/inactiva y cambio de cobertura principal.
4. Verificar que rutas públicas no enumeren pacientes y que rutas clínicas/devuelvan `401/403` correctamente.
5. Probar cookies `HttpOnly`, `SameSite`, `Secure` en producción, CSRF, CORS, límites de tasa y políticas de cabeceras.
6. Medir que logs, errores, métricas y telemetría no filtren DNI completo, credenciales, tokens ni datos clínicos.
7. Hacer despliegue gradual; verificar primero salud, registro sintético, reserva sintética, cancelación y auditoría; disponer de rollback.

**Gate de salida:** typecheck, lint, pruebas backend/frontend, integración con base descartable, E2E y revisión operativa/de privacidad aprobados. No usar datos reales en ambientes de prueba.

## 8. Estrategia de pruebas mínima

- Unitarias de normalización y validación de documento, DTOs y transiciones de cobertura.
- API: DTOs estrictos, CSRF, rate limit, hash de contraseña, cookies y respuestas uniformes ante identidad existente.
- Integración MySQL: atomicidad de registro; ninguna cuenta huérfana si falla el alta de perfil/rol; unicidad de DNI; asociación correcta usuario-paciente; reserva concurrente no duplica el slot.
- Autorización: paciente no puede indicar otro `patientId`; administrativos no consultan historia clínica; público no lista pacientes; administrador no obtiene permisos clínicos por tener rol de administración de cuentas.
- E2E: buscar turno sin login → crear cuenta → volver al slot → reservar; usuario existente → login → reservar; conflicto de horario → volver a buscar; actualizar contacto; pedir corrección de DNI; agregar segunda cobertura y dar de baja la anterior; invitación administrativa.
- Privacidad: no persistir formulario sensible en almacenamiento del navegador; limpiar contraseña al enviar/cambiar de ruta; no incluir datos personales o clínicos en logs ni solicitudes a Gemini.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación propuesta |
|---|---|
| Asociar la cuenta nueva a la ficha de otra persona por un DNI conocido | No usar coincidencia de datos como prueba de identidad; verificación del titular o revisión de recepción. |
| Enumeración de pacientes/cuentas por registro | Respuestas uniformes, rate limit y resolución privada por canal verificado. |
| DNI incorrecto o duplicado bloquea el alta | Normalizar y validar; permitir corrección auditada; no cambiar identificadores sensibles como edición ordinaria. |
| Dos pacientes reservan el mismo horario | Revalidación y reserva en transacción; conflicto explícito y nueva búsqueda. |
| Cambio de cobertura altera retrospectivamente turnos | Guardar referencia/snapshot operacional mínimo por reserva y no reescribir el historial. |
| Cuenta privilegiada creada por error o abuso | Ningún registro público con roles; bootstrap controlado; invitación limitada y auditoría. |
| Subir imágenes amplía exposición de datos sensibles | Diferir adjuntos hasta definir almacenamiento privado, acceso, retención, análisis y borrado. |
| Cobertura elegida no es aceptada por profesional | No mostrar aceptación ni filtrar por red hasta disponer de catálogo/reglas confiables. |

## 10. Decisiones pendientes para aprobar antes de ejecutar

1. ¿La disponibilidad de turnos y el directorio de médicos/especialidades serán públicos antes de iniciar sesión? Recomendación: sí, solo lectura y con información mínima.
2. ¿Se exige verificación de email o teléfono antes de reservar? Recomendación: email verificado antes de activar la cuenta; confirmar proveedor y costo operativo.
3. ¿La cobertura será obligatoria para solicitar cualquier turno o solo para validar/confirmar determinadas prestaciones? Recomendación: permitir particular/sin cobertura hasta que el consultorio defina el alcance.
4. ¿Qué documentación y aprobación exige una corrección de DNI? Recomendación: solo personal autorizado, motivo registrado, posible revisión del titular y auditoría.
5. ¿Se aceptan reservas de menores desde el primer release? Recomendación: no hasta diseñar tutor/grupo familiar y consentimiento.
6. ¿Quién puede invitar a administradores y se requiere MFA o segunda aprobación? Recomendación: el primer administrador se provisiona fuera del sitio; luego solo un administrador activo invita, sujeto a revisión operativa.
7. ¿Se necesita un bloqueo temporal del horario durante el registro? Recomendación inicial: no; revalidar al confirmar. Agregar hold solo si las métricas/operación demuestran que la persona pierde turnos durante checkout.

## 11. Referencias internas

- Contrato HTTP: `contracts/openapi.yaml`.
- Rutas actuales de autenticación: `server/src/routes/auth-v1.ts`.
- Rutas actuales de pacientes/coberturas: `server/src/routes/patients-v1.ts`.
- Rutas actuales de turnos y su validación transaccional: `server/src/routes/appointments-v1.ts`.
- Rutas actuales de administración de cuentas: `server/src/routes/administration-v1.ts`.
- Cliente HTTP del frontend: `src/lib/api.ts`.
- Cliente de pacientes y coberturas: `src/lib/clinic.ts`.
- Plan frontend actual: `docs/frontend-implementation-plan-3765be.md`.
- Plan backend actual: `docs/backend-implementation-plan-3765be.md`.

