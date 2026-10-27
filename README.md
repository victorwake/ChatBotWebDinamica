# ChatBot Web Dinámica

Sistema de gestión médica en Next.js con navegación por rutas y una API HTTP versionada.

## Requisitos

- Node.js 20+
- Una API key de [Google AI Studio](https://aistudio.google.com/) (opcional, para respuestas neutrales del asistente)

## Instalación

```powershell
# Dependencias del frontend (Next.js)
npm install

# Dependencias del backend (Express)
cd server
npm install
Copy-Item .env.example .env
cd ..
```

Antes de iniciar el backend, completá las variables `DB_*` de `server/.env` con una base MySQL disponible. El servidor ahora valida su configuración y no inicia si faltan valores requeridos. Las migraciones se ejecutan explícitamente desde `server/` con `npm run migrate`; no se aplican al iniciar el servicio. Los archivos SQL de migración se mantienen locales y no se suben a Git.

### Modelo de IA (opcional)

Copiá [`.env.example`](.env.example) a `.env.local` y completá la key:

```
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
LLM_API_KEY=
LLM_MODEL=gemini-2.0-flash
LLM_TIMEOUT_SECONDS=30
```

La key es solo de servidor: no uses `NEXT_PUBLIC_`.

`NEXT_PUBLIC_API_URL` contiene la URL pública del backend, no credenciales. El cliente usa `/api/v1`, incluye cookies, obtiene CSRF para escrituras y muestra los errores de red/HTTP sin convertirlos en datos vacíos.

El asistente solo envía a Gemini mensajes neutrales de una lista permitida y no incluye datos de pacientes ni el historial de conversación. Las solicitudes para abrir secciones se resuelven localmente y navegan a sus rutas protegidas; la API de chat no decide rutas ni devuelve datos de pacientes.

## Uso

El proyecto necesita **dos terminales**:

| Terminal | Comando | Puerto | Qué levanta |
|----------|---------|--------|-------------|
| 1 | `npm run dev:server` | 4000 | Backend Express (API REST) |
| 2 | `npm run dev` | 3000 | Frontend Next.js |

Abrí `http://localhost:3000` en el navegador.

## Navegación

La aplicación ofrece Acceso con sesión basada en cookie HttpOnly, consulta del perfil autenticado, cierre de sesión y un panel con contenido adaptado a los roles. El chatbot permanece montado al navegar entre rutas y conserva la conversación en memoria.

Profesionales y especialidades se consultan desde el directorio autenticado. Pacientes pueden consultar su propio historial clínico y detalle de atenciones; profesionales pueden consultar los registros autorizados y registrar atenciones, diagnósticos, tratamientos y recetas. El personal administrativo no tiene acceso a esas vistas clínicas. Estos datos se solicitan a la API y no se guardan en almacenamiento local. Pacientes, coberturas y turnos consumen las rutas `/api/v1`: el personal administrativo puede buscar/registrar pacientes y gestionar turnos; cada paciente puede consultar sus propios datos y coberturas, solicitar turnos y seguir su estado. Disponibilidad, paginación, estados y permisos vienen de la API. El contrato todavía no permite editar horarios ni excepciones de atención, ni ofrece catálogo de prestadores para coberturas; por eso la interfaz no simula esas operaciones y pide el ID de prestador asignado por el consultorio. No hay cuentas de prueba incorporadas; se necesita una cuenta provisionada por el backend.

El rol `administrator` puede consultar y actualizar el estado y los perfiles de las cuentas, además de revisar los metadatos de auditoría. La API controla los permisos y las reglas de negocio, incluida la protección de la última cuenta administradora activa. La interfaz no crea cuentas ni gestiona credenciales porque esas operaciones no forman parte del contrato. Este rol no concede acceso clínico; `administrative` sigue siendo un perfil distinto.

## Validación del frontend

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```
