# Plan de mejoras: registro de pacientes y solicitud de turnos

**Estado:** Fases 0 y 1 cerradas como decisiones y diseño. Fases 2 y 4 implementadas localmente, con gates operativos pendientes. Fase 3 implementada; suites y probes HTTP aprobados el 02/11/2026, pero sigue pendiente el recorrido E2E completo en navegador.

**Fecha:** 02/11/2026

## Estado de las fases

- **Fase 0 — Decisiones operativas y de identidad:** ✅ Terminada el 27/10/2026. Las decisiones funcionales están acordadas y documentadas; los prerrequisitos abiertos para producción quedan registrados como gates.
- **Fase 1 — Contrato y modelo de datos:** ✅ Terminada el 28/10/2026. Contrato, tipos, esquema objetivo, preflight y revisión de compatibilidad documentados.
- **Fase 2 — Registro y autenticación de pacientes:** 🟡 Implementación local completa; liberación bloqueada por gates operativos. Backend de registro/verificación, pantalla de alta, bloqueo de login sin verificar, migraciones locales y pruebas automatizadas implementados. Faltan probar entrega real con Resend, aprobar consentimiento/privacidad y repetir preflight/aplicar migraciones en cada entorno destino.
- **Fase 3 — Búsqueda pública y reserva continuada:** 🟡 Endpoints y pantallas públicas, continuidad de la selección, revalidación, regla de solapamiento, navegación del chat a la búsqueda pública y selección visual de horarios con resumen/modal de confirmación implementados; suites, build y probes HTTP pasan. Pendiente recorrido E2E completo de navegador.
- **Fase 4 — Alta administrativa e invitaciones:** ✅ Implementada localmente y validada. Incluye emisión/reenvío, aceptación de un solo uso, UI y bootstrap protegido del primer administrador. La migración privada 005 está aplicada solo en la base local; email real, proceso aprobado de verificación de identidad y ejecución controlada del bootstrap siguen siendo gates de entorno.
- **Fases 5–7 — Implementación y liberación:** ⏳ Pendientes.

## 1. Objetivo

Permitir que una persona nueva encuentre disponibilidad y solicite un turno sin que el sistema la deje bloqueada en el login, mientras se crea de forma segura una cuenta de paciente ligada a su ficha. También cubrir el mantenimiento administrativo de pacientes, documentos, coberturas y cuentas, incluyendo el alta controlada de administradores.

La aplicación debe seguir comunicándose con el backend exclusivamente mediante `/api/v1` y el contrato OpenAPI. El frontend no debe depender de MySQL ni de la tecnología concreta del servidor.

## 2. Estado actual verificado

- Las consultas de especialidades, profesionales y disponibilidad son públicas, de solo lectura y rate-limited; la reserva continúa requiriendo sesión.
- `POST /auth/register` y la verificación de email están implementados. Las invitaciones continúan pendientes.
- `POST /patients` crea un perfil, no una cuenta, y está limitado a `administrative` y `administrator`.
- El paciente puede actualizar teléfono, email y domicilio. El DNI no se admite en la actualización actual.
- El contrato permite varias coberturas por paciente y agregar/actualizar coberturas. La baja lógica puede representarse con `active=false` y fecha de vigencia final; no existe borrado físico.
- La UI permite listar y actualizar roles/estado de cuentas, pero no crear cuentas.
- La cobertura requiere un `providerId`; el contrato ya define `GET /coverage-providers`, pero todavía falta implementar la ruta para que la interfaz elija por nombre.
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

## 6. Contrato API y estado de implementación

El contrato OpenAPI ya define las operaciones siguientes. La presencia en el contrato no significa que la ruta esté implementada: las operaciones de registro/invitación y las consultas públicas quedan para las fases de implementación indicadas abajo. Los tipos de cliente pueden anticipar el contrato, pero no deben invocar rutas que el backend aún no expone.

| Operación contractual | Acceso | Propósito |
|---|---|---|
| `GET /specialties`, `GET /doctors`, `GET /appointments/availability` | Público, solo lectura y rate limit | Permitir que una persona nueva encuentre opciones. Definir qué información de profesionales/agenda puede publicarse. |
| `POST /auth/register`, `POST /auth/verify-email` | Público + CSRF + rate limit | Crear cuenta de paciente y perfil vinculado; responder `202` de forma genérica. La cuenta no puede reservar hasta verificar el email. El DTO no acepta roles ni IDs internos. |
| `POST /auth/registration-invitations` | Personal administrativo + CSRF | Crear ficha o invitar al titular de una ficha existente sin establecer su contraseña. |
| `POST /auth/accept-invitation` | Token de un uso + CSRF | Verificar invitación, establecer credencial y asociar la cuenta a la ficha correcta; crea solo el rol `patient`. |
| `PATCH /patients/{patientId}` | Titular para campos permitidos; personal autorizado para correcciones | Separar campos ordinarios de cambios de DNI/identidad; registrar auditoría de cambios sensibles. |
| `GET /coverage-providers` | Público o sesión, según decisión operativa | Catálogo de entidades activas con identificadores de API, nombres y, si existe fuente confiable, planes disponibles. |
| `GET/POST /patients/{patientId}/coverage` | Titular de la ficha o personal autorizado | Listar y agregar coberturas. |
| `PUT /patients/{patientId}/coverage/{coverageId}` | Titular de la ficha o personal autorizado | Actualizar datos, vigencia, principalidad o baja lógica (`active=false`). |
| `POST /users` (operación contractual ya existente) | Solo `administrator` | Alta controlada de cuentas privilegiadas sin exponer passwords ni aceptar escalamiento desde clientes públicos. El primer administrador sigue siendo un procedimiento de bootstrap. |
| `POST /appointments` | Paciente autenticado o personal autorizado | Reservar con identidad asociada a la sesión; volver a validar disponibilidad de manera atómica. |

Cada operación debe documentar DTO estricto, errores `401/403/409/422`, CSRF, idempotencia cuando aplique, límites de tasa y reglas de auditoría. El contrato de registro no debe distinguir en mensajes públicos entre “email/DNI existente” y otros conflictos que permitan enumeración; el flujo de resolución debe ser privado.

## 7. Fases de implementación

### Fase 0 — Decisiones operativas y de identidad

**Decisiones confirmadas:**

1. **Catálogo y disponibilidad:** serán públicos antes del login, limitados a información mínima de especialidades/profesionales y horarios. Nunca expondrán pacientes, agenda privada ni historia clínica.
2. **Registro:** nombre, apellido, DNI, fecha de nacimiento, móvil y email obligatorios; domicilio opcional.
3. **Verificación:** email verificado antes de habilitar reservas. Se eligió Resend; configuración y prueba real por entorno siguen siendo prerrequisitos de producción.
4. **Identidad existente:** no vincular cuentas o fichas automáticamente por coincidencia de DNI/email ni revelar públicamente si esos datos ya existen. Resolver por verificación adecuada o revisión privada del consultorio.
5. **Cobertura:** opcional; se permite atención particular. No afirmar que una obra social/plan está aceptado por un profesional hasta tener un catálogo y reglas mantenidas por el consultorio.
6. **Corrección de DNI:** reservada a personal autorizado, con motivo obligatorio, validación de duplicados y auditoría.
7. **Menores y grupo familiar:** fuera del primer release, hasta definir tutoría y consentimiento.
8. **Administradores:** el primero se provisiona mediante bootstrap fuera del sitio; altas posteriores mediante invitación auditada por un administrador autorizado. El registro público nunca puede crear roles privilegiados.
9. **Horario seleccionado:** no se retiene durante el registro. La API vuelve a validar disponibilidad al confirmar; ante conflicto, el usuario debe elegir otro horario.
10. **Adjuntos y recordatorios:** fotos de DNI/credenciales/órdenes y notificaciones por email/WhatsApp quedan fuera hasta elegir proveedor y definir almacenamiento, acceso y retención.

**Prerrequisitos aún abiertos:**

- Elegir, configurar y probar el proveedor de email; producción no habilitará el autorregistro/verificación hasta que funcione el envío, expiración y uso único de tokens.
- Definir recuperación de cuenta y si se exigirá MFA para `administrator` antes de habilitar altas privilegiadas desde la aplicación.
- Obtener revisión operativa/legal de consentimiento, privacidad, retención y datos requeridos. Este plan no representa una certificación de cumplimiento legal.
- Precisar qué datos de profesionales/especialidades pueden publicarse y confirmar que el consultorio autoriza la disponibilidad pública.

**Salida:** decisiones funcionales principales registradas. La Fase 0 queda cerrada para continuar el diseño del contrato; los prerrequisitos abiertos son gates explícitos y no pueden resolverse por supuestos de implementación.

### Fase 1 — Contrato y modelo de datos

1. Actualizar `contracts/openapi.yaml` con registro, invitaciones, catálogo y reglas de actualización de pacientes/coberturas.
2. Revisar `server/migrations/` y los datos/esquema locales no versionados antes de decidir migraciones. Verificar claves únicas de DNI/email, asociación `users`–`personas`–`pacientes`, password hash, y referencias de cobertura desde turnos.
3. Diseñar cambios mínimos de persistencia y un procedimiento de migración/rollback, sin publicar en Git scripts que el proyecto mantiene privados.
4. Preparar una migración privada con unicidad sobre DNI normalizado y email de cuenta normalizado. Repetir el preflight en cada entorno y resolver manualmente cualquier colisión antes de aplicarla; nunca fusionar identidades automáticamente.
5. Definir los eventos de auditoría para correcciones de DNI, invitaciones, cambios de roles/estado y cambios de cobertura, con referencias mínimas y sin snapshots de datos personales, números de afiliado, credenciales ni información clínica.
6. Actualizar los modelos y tipos del cliente TypeScript generados o mantenidos desde el contrato.

**Gate de diseño:** contrato, seguridad, migración privada y compatibilidad backend/frontend revisados. La migración no se aplica automáticamente; su preflight y aplicación controlada son requisito previo a habilitar las escrituras de Fase 2 en cada entorno.

### Fase 2 — Registro y autenticación de pacientes (P1)

**Avance:** endpoints de registro/verificación, integración configurable con Resend, bloqueo de login no verificado, formularios `/register` y `/verify-email`, y migraciones locales 003/004 implementados. La configuración de Resend no contiene credenciales en el repositorio. La cuenta y el token quedan guardados en transacción; si Resend falla, el endpoint devuelve `503` y un reintento con la misma identidad y contraseña rota el token previo. La verificación habilita la sesión únicamente con rol `patient`.

1. Implementar `POST /auth/register` con validación estricta, rate limit, hash de credencial, CSRF y creación transaccional de persona, paciente, usuario, rol `patient` y asociación. **Implementado.**
2. Implementar flujo de activación/verificación acordado con Resend; mantener el registro cerrado si falta configuración y no habilitar registro de producción sin envío real probado. **Código implementado; configuración/entrega real pendiente.**
3. Resolver los conflictos de identidad sin revelar datos de cuentas ya existentes ni enlazar automáticamente perfiles no verificados. **Implementado con respuesta `202` genérica y aviso sin token para conflictos.**
4. Implementar formulario y ruta de registro, errores de validación y accesibilidad. **Implementado.** El consentimiento legal definitivo continúa pendiente de aprobación operativa; la casilla actual solo confirma la exactitud de los datos y la solicitud de alta.
5. Añadir “Crear cuenta” desde `/login` y desde el momento en que la persona intenta confirmar una reserva. **Enlace desde `/login` implementado; integración desde el flujo de reserva queda para Fase 3.**
6. Probar alta, login, logout, CSRF, rate limit, duplicados, expiración/reuso de token y persistencia de asociación. **Pruebas automatizadas implementadas para alta, CSRF, login previo a verificación, verificación de un uso, expiración y reemisión, límites de registro/verificación, reintento ante fallo de entrega, duplicados y asociación paciente. La entrega real del proveedor y su configuración siguen pendientes.**

**Aceptación:** una persona nueva puede completar el alta y terminar autenticada como `patient`; no puede asignarse otro rol ni consultar fichas ajenas. El flujo está cubierto por pruebas locales. Para liberar, además deben configurarse y probarse Resend con credenciales del entorno, aprobarse consentimiento/privacidad y aplicarse las migraciones en cada entorno destino después de su preflight. No declarar habilitada la fase en producción hasta cerrar esos gates.

### Fase 3 — Búsqueda pública y reserva continuada (P1)

1. Definir endpoints públicos de solo lectura para especialidades, profesionales y disponibilidad, con rate limit y minimización de datos. **Implementado:** rutas activas únicamente y protegidas por el rate limit global de `/api/v1`; las respuestas no contienen datos de pacientes ni contactos profesionales.
2. Permitir navegar la disponibilidad sin sesión y conservar solo la selección no sensible durante la transición a login/registro. **Implementado:** `/specialties`, `/doctors` y `/appointments/availability` son páginas públicas. La disponibilidad se agrupa por día argentino, permite elegir un horario y muestra un resumen con modal antes de confirmar; Slot ID y filtros permitidos viajan como query de continuación al enlace de verificación, sin persistir datos personales/clínicos ni usar `localStorage`.
3. Al volver autenticado, reconsultar/validar el slot y reservar a partir de `patientId` de la sesión. Nunca aceptar del navegador un paciente diferente para el rol `patient`. **Implementado:** la UI reconsulta antes de enviar y el backend vuelve a validar dentro de la transacción; el servidor ignora/rechaza un `patientId` ajeno.
4. Reutilizar la transacción existente de reserva y sus controles de concurrencia; respuestas `409` vuelven a disponibilidad. **Implementado:** reserva transaccional existente preservada; conflicto refresca las opciones sin presentar una reserva falsa.
5. Revisar duplicados de turno antes de agregar restricciones. **Decisión confirmada:** bloquear solapamientos horarios del mismo paciente con cualquier profesional cuando el otro turno esté `pending` o `confirmed`; turnos cancelados no bloquean. Implementado de forma transaccional en reserva y reprogramación, con serialización por ficha de paciente y pruebas de carreras.
6. No filtrar disponibilidad por cobertura hasta tener catálogo confiable y relación profesional–plan; presentar la cobertura como dato informativo si todavía no existe esa validación. **Implementado:** la búsqueda no usa ni afirma compatibilidad de coberturas.

**Validación actual (02/11/2026):** validación runtime standalone aprobada: frontend 44/44 pruebas, backend 26/26, lint, typecheck y build; HTTP 200 en la página pública de disponibilidad y en especialidades, profesionales y disponibilidad de la API. Se agregó una prueba de integración que verifica acentos en nombres públicos al escribirlos y leerlos desde MySQL. El intento de grabación llegó a login conservando la continuación y el horario seleccionado, pero el replay automático falló y no generó un spec reutilizable. La instancia compartida inicialmente respondió 401 en las rutas públicas; en la siguiente verificación ya había un proceso backend nuevo y todas las rutas respondieron 200, y la página de búsqueda volvió a cargar al recargarla. En la base local de desarrollo también se encontraron nombres de catálogo con mojibake aunque columnas, conexión y respuesta usan UTF-8. Con autorización, se corrigieron transaccionalmente 5 nombres de especialidades activas y 2 apellidos de profesionales activos; no se modificaron filas de pacientes ni de turnos. Las rutas públicas devuelven ahora el catálogo correctamente codificado. Se corrigió el destino del comando conversacional para sacar/agendar/reservar un turno: ahora abre `/appointments/availability`; “ver mis turnos” continúa en la sección privada. El recorrido E2E hasta reservar sigue pendiente; los probes y la navegación del chat no lo sustituyen.

**Aceptación:** una persona puede explorar sin sesión, elegir un horario, iniciar sesión o registrarse, verificar su email, volver a la búsqueda y confirmar el turno. La sesión y el chat permanecen en el layout raíz; al regresar se vuelve a consultar disponibilidad. Si el horario no está disponible, se ofrece una alternativa sin mostrar una reserva falsa.

### Fase 4 — Alta administrativa e invitaciones (P1)

1. Extender el alta administrativa de paciente para registrar contacto y emitir invitación segura, sin asignar contraseña ni imprimir un secreto. **Implementado:** alta nueva con invitación opcional y ruta para invitar una ficha existente; autorización administrativa, CSRF y creación de la ficha con invitación en una transacción.
2. Implementar aceptación de invitación, expiración, un solo uso, invalidación y manejo de reenvío con respuesta que no permita enumerar cuentas. **Implementado:** token opaco de 256 bits guardado como hash, expiración de 24 horas, consumo único, revocación al reenviar y respuestas genéricas para fichas/cuentas no elegibles.
3. Crear una cuenta desde una ficha existente solo después de comprobar que quien la reclama está autorizado a vincularse. **Implementado como control de proceso:** email debe coincidir con el contacto de la ficha y el personal debe registrar una confirmación explícita de la verificación aprobada de identidad/acceso. El proceso de verificación debe aprobarse y documentarse operativamente antes de producción.
4. Añadir UI para personal `administrative`; auditoría y permisos validados también en el backend. **Implementado:** formulario para invitar fichas nuevas/existentes; backend concede únicamente `patient` y audita emisión/aceptación sin email, tokens, credenciales ni datos clínicos.
5. Implementar el bootstrap del primer administrador como comando de despliegue/documentación operativa, con secretos fuera del repositorio. Altas posteriores solo por un flujo privilegiado y auditado. **Implementado:** comando `bootstrap:administrator` exige confirmación, credenciales inyectadas por secretos, ausencia de cuentas con rol administrador y deja auditoría; no se ejecutó en ningún entorno.

**Aceptación:** recepción puede registrar un paciente e invitarlo; no conoce su contraseña. Ningún endpoint público permite crear o promover cuentas administrativas.

**Validación:** backend, 26/26 pruebas de integración; frontend, 39/39; lint, typecheck y build de producción correctos; OpenAPI parseado con 33 paths, 39 operaciones e IDs únicos. La prueba de invitación verifica autorización, reenvío/revocación, hash y expiración del token, consumo único, sesión de paciente y auditoría. La entrega real de Resend, revisión/aprobación del proceso de verificación de identidad, aplicación de 005 en entornos destino y ejecución del bootstrap inicial siguen pendientes.

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

## 10. Decisiones y gates registrados

Las decisiones de flujo y producto de la Fase 0 se confirmaron el 27/10/2026 y están incorporadas en la sección 7. Antes de habilitar el flujo en producción se deben cerrar los prerrequisitos indicados allí: proveedor de email, recuperación/MFA administrativa, revisión operativa/legal y autorización de publicación del directorio/disponibilidad.

La salida y evidencia de Fase 1 están documentadas en `docs/fase-1-contrato-y-modelo-registro-turnos.md`. La fase queda cerrada como diseño y preparación de migración, no como despliegue de esquema ni implementación de rutas. Antes de habilitar escrituras de registro en cada entorno, repetir el preflight y aplicar la migración privada aprobada. Los gates operativos de email, recuperación/MFA administrativa, privacidad y autorización de publicación siguen vigentes; no habilitar registro en producción ni crear administradores mediante UI mientras correspondan.

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
