# Resumen funcional de datos

## Propósito

El sistema está pensado para apoyar la gestión de un centro médico: organizar pacientes, profesionales, turnos y la información generada durante la atención. Esta guía describe esos usos a nivel general; no es una especificación técnica ni permite reconstruir la base de datos.

## Información que administra

- **Personas y pacientes:** información necesaria para identificar y contactar a los pacientes y dar seguimiento a su atención.
- **Profesionales y especialidades:** datos de referencia para organizar la oferta médica y la disponibilidad de atención.
- **Turnos:** solicitudes y asignaciones de atención, con seguimiento de sus cambios y estado.
- **Atención médica:** registro de consultas y de la información clínica asociada, como antecedentes relevantes, indicaciones y recetas.
- **Acceso al sistema:** cuentas y perfiles de usuario para distinguir las operaciones disponibles según la función de cada persona.
- **Seguimiento operativo:** registro de acciones relevantes para facilitar el control y la revisión de la actividad.

## Cómo se relaciona la información

La información de identidad sirve de referencia para los perfiles de pacientes, profesionales y usuarios del sistema. Los turnos conectan a un paciente con una atención profesional; cuando la atención se concreta, puede dar lugar a información clínica vinculada. Los catálogos de especialidades y coberturas ayudan a organizar la atención, sin sustituir el registro propio de cada persona.

## Flujo general de uso

1. Se registra o consulta la información del paciente.
2. Se identifica la atención profesional adecuada y se coordina un turno según la disponibilidad.
3. El turno puede cambiar de estado o modificarse durante la gestión.
4. Después de la atención, el profesional registra la información clínica que corresponda.
5. Las operaciones relevantes pueden quedar disponibles para seguimiento administrativo.

## Perfiles de uso

- **Paciente:** consulta o gestiona su propia atención, de acuerdo con las funciones habilitadas.
- **Profesional de salud:** organiza sus atenciones y consulta la información clínica necesaria para prestar atención.
- **Personal administrativo:** gestiona registros y turnos, sin que eso implique acceso general a la información clínica.
- **Administración del sistema:** mantiene la configuración y los accesos necesarios para operar la aplicación.

Los permisos efectivos deben aplicarse en el servidor y limitarse a la información necesaria para cada tarea.

## Criterios de gestión

- Mantener relacionados los registros que corresponden a una misma persona y a su atención.
- Evitar asignaciones incompatibles con la disponibilidad del profesional.
- Conservar contexto suficiente para entender los cambios importantes en turnos y registros.
- Tratar la información clínica y las credenciales como información restringida.
- Evitar que la eliminación o modificación administrativa haga perder innecesariamente el contexto histórico.

## Estado actual de la aplicación

El modelo anterior describe el funcionamiento previsto. En la versión actual, la API del servidor trabaja con datos de ejemplo en memoria para pacientes, usuarios y turnos; no representa una conexión activa a una base persistente. Por ello, esos cambios de prueba no deben considerarse almacenamiento duradero ni un sistema listo para gestionar datos clínicos reales.

## Alcance de esta guía

Este resumen omite deliberadamente la estructura física, los nombres y definiciones de objetos, los campos, las restricciones, los índices, las instrucciones de instalación y los datos de ejemplo. Sirve para comprender el propósito y el flujo general, no para crear, restaurar o mantener la base de datos. La documentación técnica y los scripts detallados se mantienen fuera de este repositorio.
