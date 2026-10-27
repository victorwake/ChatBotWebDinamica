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

Los datos sintéticos se desactivan por defecto. Para una demostración local se puede establecer `NEXT_PUBLIC_ENABLE_DEMO_DATA=true`; no habilitarlo en producción. El asistente solo puede enviar a Gemini mensajes neutrales de una lista permitida y nunca incluye el historial de conversación.

## Uso

El proyecto necesita **dos terminales**:

| Terminal | Comando | Puerto | Qué levanta |
|----------|---------|--------|-------------|
| 1 | `npm run dev:server` | 4000 | Backend Express (API REST) |
| 2 | `npm run dev` | 3000 | Frontend Next.js |

Abrí `http://localhost:3000` en el navegador.

## Navegación

La aplicación ofrece Acceso con sesión basada en cookie HttpOnly, consulta del perfil autenticado, cierre de sesión y un panel con contenido adaptado a los roles. Las rutas Panel, Perfil, Pacientes y Turnos requieren una sesión válida; los módulos de pacientes/turnos siguen pendientes de sus fases funcionales.

## Validación del frontend

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```
