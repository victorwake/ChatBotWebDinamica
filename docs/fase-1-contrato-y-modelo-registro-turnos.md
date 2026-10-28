# Fase 1 — Contrato y modelo de datos

**Estado:** ✅ Fase completada el 28/10/2026. La implementación de las rutas queda para las fases siguientes.

## Alcance realizado

- Se amplió `contracts/openapi.yaml` con registro/verificación de email, invitaciones de pacientes, corrección auditada de identidad y catálogo de coberturas.
- Se documentó la consulta pública de especialidades, profesionales y disponibilidad con minimización de datos y limitación de frecuencia.
- Se definieron DTOs estrictos, respuestas genéricas contra enumeración, requisitos CSRF, estados HTTP y reglas de rol para las nuevas operaciones.
- Se agregaron los tipos mantenidos por el cliente en `src/lib/session.ts` y `src/lib/clinic.ts`. No se agregaron llamadas a rutas todavía inexistentes.
- Se verificó en modo solo lectura el esquema objetivo MySQL, el estado/checksum de las migraciones y conteos agregados de colisiones/referencias. No se leyeron registros ni valores de identidad, salud o credenciales.

## Decisiones de contrato

1. `POST /auth/register` acepta únicamente datos de perfil y credencial; no recibe IDs ni roles. Responde `202` con el mismo mensaje para datos nuevos y conflictos de identidad. Crea la cuenta con el rol `patient`, genera verificación de email y no inicia sesión antes de verificar.
2. `POST /auth/verify-email` y `POST /auth/accept-invitation` consumen tokens opacos, de un solo uso, con expiración; nunca devuelven el token y no lo exponen en logs. La aceptación de invitación crea solo una cuenta `patient`.
3. `POST /auth/registration-invitations` permite a `administrative` o `administrator` invitar una ficha existente o crear ficha e invitación. Para una ficha existente, el email debe coincidir con el contacto guardado y el personal verifica por un proceso aprobado la identidad y el acceso a ese email; la operación no cambia el contacto ni vuelve a vincular fichas. El primer administrador sigue siendo un procedimiento de bootstrap; esta operación no crea cuentas administrativas.
4. El cambio habitual de contacto queda separado de `POST /patients/{patientId}/identity-corrections`. La corrección requiere personal autorizado, DNI y motivo; actualización y auditoría deben ser atómicas.
5. El catálogo de coberturas devuelve solo identificador y nombre. Hasta que se decida operativamente si debe ser público, requiere sesión. No afirma aceptación por profesional ni expone planes sin una fuente operativa aprobada.
6. La baja de cobertura es lógica (`active=false`), exige fecha final y elimina principalidad. No existe baja física; la referencia de turnos debe mantenerse.
7. El catálogo profesional y la disponibilidad son públicos, de solo lectura y rate-limited. La publicación efectiva sigue condicionada a la autorización operativa registrada en Fase 0.
8. Reintentos de registro/invitación no duplican cuentas ni fichas; cada cuenta o ficha mantiene como máximo un token vigente y un token reemitido invalida el anterior.

## Evidencia del esquema local privado

La migración `server/migrations/001_initial_schema.sql` está ignorada por Git a propósito y se inspeccionó solo en el entorno local:

| Área | Estado observado |
|---|---|
| Cuenta e identidad | `users.persona_id` es único y referencia `personas`; `pacientes.persona_id` también es único. `users.email` y `personas.dni` tienen restricciones `UNIQUE`. |
| Credenciales | `users.password_hash` existe; el servidor actual usa Argon2id para nuevas hashes. `users.email_verified` ya existe, pero el login actual no lo consulta. |
| Normalización | Las restricciones únicas actuales no garantizan la política de normalización acordada (DNI sin separadores y email sin espacios/case-folding consistente). No se deben fusionar coincidencias automáticamente. |
| Coberturas | Hay unicidad de afiliación por paciente/entidad/número y de cobertura principal activa. `turnos.paciente_obra_social_id` referencia la cobertura con `ON DELETE SET NULL`, por lo que un borrado físico podría perder la referencia histórica. |
| Auditoría | Existe `auditoria` con snapshots JSON anteriores/nuevos. No usar esos snapshots para duplicar DNI, credenciales, información clínica u otros datos personales en los nuevos flujos. |

### Verificación de la base objetivo

Se consultó únicamente `information_schema`, el historial `schema_migrations` y conteos agregados; no se leyó ni exportó ningún registro de persona, paciente, usuario, cobertura o turno. No se mostraron ni copiaron valores de configuración/credenciales.

- MySQL: `8.4.10`.
- `001_initial_schema.sql` y `002_auth_sessions.sql`: `applied`; ambos checksums locales coinciden con el historial. No hay migraciones aplicadas sin archivo local.
- Las tablas, columnas y restricciones relevantes observadas coinciden con la migración versionada para personas, pacientes, usuarios, roles, coberturas, turnos y auditoría.
- Preflight de identidad normalizada (`DNI` solo dígitos; email `LOWER(TRIM(...))`): **0 grupos duplicados** en ambas entidades.
- Referencias huérfanas: **0** para usuario→persona, paciente→persona y turno→cobertura.
- La FK de `turnos.paciente_obra_social_id` usa `ON DELETE SET NULL`; se debe mantener baja lógica y nunca borrar coberturas con historial. No se alteró la base.

Esta comprobación verifica el esquema del entorno configurado, no todos los entornos desplegados ni tipos/defaults/collations de cada columna. El gate de Fase 1 queda satisfecho para esta base; se requiere repetir el preflight en cada entorno antes de migrar.

## Propuesta mínima de persistencia

La siguiente propuesta guía una futura migración **privada**; no se incluye SQL ejecutable en Git:

1. Canonicalizar DNI en servidor (solo dígitos, conservando ceros iniciales) y respaldar la unicidad con una columna generada/índice único compatible con MySQL 8.4. Detectar colisiones en cada entorno y resolverlas manualmente antes de aplicar la restricción.
2. Canonicalizar email de cuenta con `LOWER(TRIM(email))` y unicidad en la cuenta. El email de contacto de una persona no es prueba de identidad ni debe asociarse automáticamente a una cuenta. El preflight de la base revisada no encontró colisiones normalizadas.
3. Reutilizar la relación existente persona–paciente–usuario y la tabla de roles. Crear persona, paciente, usuario, asociación al rol `patient` y token en una sola transacción; guardar solo el hash de la contraseña y el hash del token.
4. Añadir almacenamiento de tokens de verificación/invitación con propósito, referencia a paciente/cuenta, email destinatario, hash SHA-256 único, expiración, consumo/revocación y actor emisor. Limitar a un token vigente por titular mediante bloqueo transaccional, revocar el anterior al reemitir y nunca guardar el token en claro.
5. Añadir auditoría específica mínima para corrección de identidad: actor, paciente, tipo de acción, fecha y motivo. No copiar los DNI anterior/nuevo, credenciales ni datos clínicos en snapshots o logs generales.
6. La FK observada permite `ON DELETE SET NULL`; por lo tanto, mantener la baja lógica y no exponer borrado físico. Si se decide endurecer la FK a `RESTRICT`, hacerlo en migración privada solo tras validar compatibilidad en cada entorno. Ninguna actualización puede reescribir la cobertura histórica de un turno.

## Procedimiento de migración y rollback

1. Respaldar la base y comprobar que la migración aplicada coincide con el esquema real antes de cualquier DDL.
2. Ejecutar preflight de duplicados para DNI/email normalizados y referencias huérfanas de cobertura; documentar los conteos y resolver cada conflicto manualmente, sin auto-fusión.
3. Aplicar primero cambios aditivos y backfill controlado; verificar unicidad y referencias antes de activar restricciones nuevas.
4. Desplegar servidor compatible con esquema anterior/nuevo; habilitar rutas únicamente tras pasar pruebas de transacción, expiración/uso único, CSRF, rate limit, privacidad y concurrencia.
5. Para rollback, deshabilitar rutas nuevas y volver a la versión anterior. Revertir DDL solo si no existen datos nuevos que dependan del esquema; de lo contrario, corregir hacia adelante. No se puede recuperar mediante rollback un vínculo histórico borrado físicamente.
6. Mantener todos los archivos SQL de migración en el canal privado de base de datos, conforme a `server/migrations/README.md`.

## Revisión del gate de Fase 1

- **Contrato:** YAML parseable, 33 rutas, operationIds únicos, referencias internas resueltas; esquemas cerrados y errores documentados. Pasó revisión.
- **Seguridad:** registro genérico `202`, sin roles/IDs elegibles por cliente, CSRF, rate limit, tokens opacos de un solo uso almacenados como hash y sin secretos en respuestas/logs; corrección de DNI administrativa con motivo/auditoría; catálogos públicos minimizados y solo lectura; catálogo de coberturas conserva sesión. Pasó revisión de diseño.
- **Persistencia/migraciones:** historial de las dos migraciones coincide con checksums y esquema relevante; preflight agregado sin colisiones ni referencias huérfanas. No se ejecutó DDL.
- **Compatibilidad:** cliente limitado a tipos, sin invocar rutas que todavía no existen. Se registraron las brechas actuales del servidor para que sean resueltas en sus fases.

La Fase 1 queda cerrada. Lo siguiente es implementar las rutas y controles en Fase 2/3, no activar el contrato aún.

## Gates que siguen pendientes para fases posteriores y producción

- Configurar y probar un proveedor real de email/verificación antes de habilitar registro en producción.
- Obtener autorización operativa para publicar el directorio y disponibilidad; verificar minimización/rate limit en la implementación.
- Aprobar consentimiento, privacidad, retención y datos requeridos con responsables operativos/legales.
- Decidir si el catálogo de coberturas será público o requerirá sesión; el contrato conserva acceso autenticado como opción conservadora.
- En Fase 2, hacer que el backend rechace login/reserva antes de verificar email. Actualmente `email_verified` no se verifica al iniciar sesión.
- En Fase 3, hacer públicos los catálogos y disponibilidad en el backend con la misma minimización y rate limit del contrato; hoy requieren sesión.
- Definir recuperación de cuenta y MFA administrativa antes de activar altas privilegiadas. La revisión de Fase 1 no habilita registro ni flujos privilegiados.
