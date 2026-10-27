# ChatBot Web Dinámica

Sistema de gestión médica con chat inteligente (Gemini + fallback por keywords) y panel de vistas.

## Requisitos

- Node.js 20+
- Una API key de [Google AI Studio](https://aistudio.google.com/) (opcional, para modo IA)

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

> Si Gemini no está configurado o falla, el chat funciona en **modo offline** con keyword matching.

## Uso

El proyecto necesita **dos terminales**:

| Terminal | Comando | Puerto | Qué levanta |
|----------|---------|--------|-------------|
| 1 | `npm run dev:server` | 4000 | Backend Express (API REST) |
| 2 | `npm run dev` | 3000 | Frontend Next.js |

Abrí `http://localhost:3000` en el navegador.

## Vistas disponibles

| Vista | Descripción |
|-------|-------------|
| `welcome` | Pantalla de inicio |
| `login` | Formulario de inicio de sesión |
| `patients` | Listado de pacientes |
| `patient_detail` | Ficha de un paciente |
| `appointment` | Gestión de turnos |
| `report` | Reportes e informes |
