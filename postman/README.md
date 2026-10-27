# Pruebas API con Postman

## Importar

En Postman, importá estos dos archivos:

- `Sistema-Medico-API.postman_collection.json`
- `Sistema-Medico-Local.postman_environment.json`

Seleccioná el environment **Sistema Médico - Local**. Cambiá `baseUrl` si el
backend escucha en otro host o puerto.

## Estado actual y contrato

- **00 - Estado del servicio**: endpoints de health ya implementados. Readiness
  espera MySQL disponible.
- **01 - Demo actual**: rutas `/api` temporales, públicas y sin sesión ni roles.
  `legacyEmail` y `legacyPassword` son editables; no se reutilizan para el
  contrato nuevo.
- **10 - Autenticación v1**: CSRF, login, perfil actual y logout están
  implementados.
- **20, 30 y 40 - Roles v1**: cada carpeta inicia automáticamente sesión con
  las credenciales de su rol. Las rutas de pacientes, coberturas y referencias
  están implementadas. La Fase 4 implementa disponibilidad, reservas y
  transiciones de turnos; probalas con
  profesionales que tengan horarios semanales activos.
- **Atención clínica - Fase 5**: pacientes consultan su historial propio. La
  carpeta profesional agrega una atención solo para un turno propio iniciado,
  y luego permite consultar detalle y agregar un diagnóstico de prueba.
- **50 - Rol administrador del sistema (Fase 6)**: gestión paginada de cuentas,
  consulta de auditoría minimizada y actualización de una cuenta sintética.
  Requiere `administrator`; una cuenta con solo `administrative` recibe `403`.

Las rutas demo actuales no emiten cookies ni tokens y no implementan permisos.
Para probar autenticación real, usá las rutas `/api/v1/auth` y las cuentas
provisionadas en MySQL.

## Sesión y CSRF automáticos

Postman guarda automáticamente las cookies `Set-Cookie` del host en su cookie
jar, incluyendo la cookie de sesión `HttpOnly`. Las requests siguientes a ese
mismo host envían la cookie sin copiar tokens ni configurar `Authorization`.
La cookie no se lee ni se guarda como variable.

El token CSRF se guarda automáticamente en `csrfToken` al ejecutar
**Obtener CSRF pre-login**. Enviá luego el login del rol elegido. Antes de cada
request que modifica datos, ejecutá **Obtener CSRF autenticado** y luego la
operación correspondiente; el header `X-CSRF-Token` toma el valor de la
variable. Para cambiar de rol, iniciá sesión con ese rol; Postman reemplazará la
cookie del mismo host.

## Credenciales y datos

Completá las variables secretas con cuentas locales de prueba provisionadas
para los roles `patient`, `administrative`/`administrator` y `doctor`. Las
cuentas deben existir en el backend; no se crean mediante la colección. No
guardes contraseñas reales en la colección, en este archivo exportado ni en
Git. En Postman, mantené los valores sensibles solo en tu entorno local.
Para la carpeta Fase 6 configurá `administratorEmail` y
`administratorPassword` con una cuenta cuyo rol sea específicamente
`administrator`; `managedUserId` debe apuntar a una cuenta sintética. La request
de actualización desactiva esa cuenta y reemplaza sus roles, así que no la
ejecutes contra cuentas reales ni contra la cuenta administradora.

Las requests de creación/actualización pueden persistir datos. Usalas solo
contra una base local de pruebas y elegí un `testNationalId` único. Para probar
coberturas, configurá `coverageProviderId` con el ID de una cobertura activa
existente en la base; el backend no publica un catálogo administrativo de
proveedores en esta fase. Para probar turnos, usá un profesional con horario
semanal activo en `America/Argentina/Buenos_Aires` y un rango futuro de hasta
31 días.

Las operaciones clínicas de escritura son persistentes y deben ejecutarse
únicamente con datos y cuentas sintéticas en una base local. Para registrar una
atención, prepará primero un turno sintético propio ya iniciado y elegible, y
configurá manualmente `clinicalAppointmentId`; la colección no selecciona
turnos existentes automáticamente para evitar modificar datos reales. Luego
ejecutá **Obtener CSRF para registrar atención** y **Registrar atención
clínica**. Diagnósticos, tratamientos y recetas son datos clínicos sensibles y
no deben probarse con información real.

## Orden sugerido

1. Ejecutá **00 - Estado del servicio**.
2. Para probar hoy, ejecutá **01 - Demo actual**.
3. Ejecutá la carpeta del rol deseado en orden: cada carpeta obtiene CSRF e
   inicia sesión con las credenciales de ese rol antes de correr sus pruebas
   de permisos.
4. Antes de cada escritura, ejecutá **Obtener CSRF autenticado** dentro de
   **10 - Contrato v1 - Autenticación** y luego la operación correspondiente
   dentro de la carpeta de rol.
