# Despliegue y recuperación operativa

Esta guía define controles requeridos para desplegar el backend. No contiene secretos, credenciales ni scripts privados de base de datos. El backend escucha HTTP; debe quedar detrás de un proxy inverso o gateway que termine TLS.

## Configuración previa

1. Usar un entorno separado y una cuenta MySQL exclusiva del servicio, con los permisos mínimos necesarios. No reutilizar la cuenta `root`.
2. Configurar `NODE_ENV=production`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y una lista `CORS_ORIGINS` de URLs HTTPS exactas. El servicio rechaza CORS HTTP y contraseña vacía en producción.
3. Guardar secretos en el gestor de secretos del hosting. No incluirlos en Git, imágenes, logs, variables públicas del frontend ni comandos registrados.
4. Configurar `TRUST_PROXY_HOPS` solo con el número exacto de proxies confiables. Mantener el backend inaccesible desde Internet salvo a través del gateway.
5. Configurar `API_RATE_LIMIT_WINDOW_MS` y `API_RATE_LIMIT_MAX` según el perfil de carga; el limitador local es por proceso. En topologías multi-instancia, aplicar límites compartidos en el gateway/WAF.
6. Restringir red y permisos de base de datos al servicio, habilitar TLS hacia MySQL si la red lo requiere y rotar credenciales ante cambios de personal o incidentes.
7. Aplicar migraciones de forma explícita con backup previo. No usar `npm run migrate:baseline` durante una actualización normal ni ejecutar DDL automáticamente al arrancar.

## Release y comprobaciones

1. Ejecutar `npm test` en una base de pruebas sintética. Debe terminar con código `0`; incluye build, flujos de autorización, persistencia, concurrencia y endurecimiento HTTP.
2. Validar `contracts/openapi.yaml` y los archivos JSON de Postman; ejecutar pruebas de contrato contra la API candidata.
3. Revisar el diff/configuración, versión de Node compatible, procedencia de dependencias, límites de memoria/conexiones y variables sin secretos expuestos.
4. Realizar backup verificable; aplicar migraciones compatibles y explícitas; desplegar sin exponer el proceso directamente.
5. Ejecutar `GET /api/v1/health/live` y `/api/v1/health/ready`, además de smoke checks autenticados con una cuenta sintética. Confirmar CORS, cookies `Secure`, cabeceras de seguridad, logs con request ID y ausencia de respuestas con información clínica.
6. Observar errores HTTP, `429`, latencia, reinicios, conexiones MySQL y uso de recursos antes de completar el rollout.

## Backups y recuperación

La política real depende de la capacidad de MySQL y del proveedor, y no está configurada por el código de la API. Como propuesta inicial sujeta a aprobación del responsable del servicio:

- Backup completo diario cifrado, almacenado fuera del host/base primaria y con acceso restringido.
- Retención sugerida de 30 días; habilitar y conservar binary logs para recuperación a un punto en el tiempo cuando el entorno lo soporte.
- Definir y aprobar objetivos RPO/RTO antes de producción. Sin esa decisión, no declarar garantizada una pérdida o tiempo de recuperación máximos.
- Verificar automáticamente que los archivos existen y no están vacíos; probar una restauración en un entorno aislado al menos mensualmente y después de cambios importantes de esquema.

Procedimiento de recuperación:

1. Declarar incidente, detener escrituras/cambios de despliegue y conservar logs y referencias temporales sin copiar datos clínicos a canales no autorizados.
2. Elegir el backup y, si está habilitado, el punto temporal aprobado; restaurar en una instancia aislada y validar integridad.
3. Comprobar migraciones, ejecutar el readiness check y pruebas de contrato/smoke sintéticas. No iniciar tráfico de usuarios durante la validación.
4. Coordinar con el responsable clínico/operativo la ventana y el punto de corte; redirigir tráfico solo después de aprobar la restauración.
5. Registrar resultado, tiempo, punto de recuperación y acciones posteriores. Conservar la instancia anterior hasta completar el análisis.

## Reversión de una versión

- Mantener la versión previa disponible y desplegar de forma gradual cuando la plataforma lo permita.
- La reversión de aplicación no revierte automáticamente cambios de esquema. Las migraciones deben ser compatibles hacia atrás o tener una reversión revisada y ensayada.
- Ante fallos de health check, errores de autorización, corrupción o aumento anormal de `5xx`, detener el rollout y volver al artefacto previo solo si el esquema sigue siendo compatible.
- Nunca restaurar una copia por encima de la base activa sin autorización, backup de estado actual y un plan de recuperación aprobado.

## Límites conocidos antes del go-live

- El servicio no trae backup automatizado, restauración, métricas/APM, alertas ni rate-limit compartido: deben configurarse en la plataforma/gateway seleccionados.
- El pipeline de CI no existe actualmente. La release debe exigir `npm test` y pruebas de contrato en un pipeline del repositorio antes de habilitar despliegues automáticos.
- El despliegue productivo, TLS, monitoreo, política RPO/RTO, retención y restauración no pueden verificarse hasta que se elija y configure el entorno operativo.
