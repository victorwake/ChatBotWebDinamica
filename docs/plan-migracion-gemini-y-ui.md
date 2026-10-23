# Plan: migrar Ollama a Gemini y modernizar las vistas

Guía de implementación para ChatBotWebDinamica. **No incluye el código de la migración**: describe qué hacer, en qué archivos, y cómo verificar.

Referencias externas (InobaLab):

- Cliente LLM OpenAI-compatible: `G:\InobaLab\api\app\providers\llm.py`
- Variables: `G:\InobaLab\api\.env.example` (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`)

---

## Objetivo

1. Quitar Ollama por completo.
2. Usar **Gemini** con el mismo patrón que InobaLab: HTTP OpenAI-compatible (`/chat/completions`), sin SDK de Google y **sin** agregar FastAPI/Python.
3. Modernizar las vistas y el widget de chat, **sin cambiar** el modelo de navegación (panel dinámico + chat flotante).
4. Conservar el fallback por keywords (`actionRegistry`) cuando no hay API key o Gemini falla.

---

## Estado actual

| Pieza | Dónde | Comportamiento |
|--------|--------|----------------|
| Proxy de chat | [`src/app/api/chat/route.ts`](../src/app/api/chat/route.ts) | `fetch` a `OLLAMA_URL/api/chat` (`stream: false`), parsea JSON `{ type, view, data, message }` |
| Env Ollama | mismo archivo | `OLLAMA_URL` default `http://localhost:11434`, `OLLAMA_MODEL` default `qwen2.5:1.5b` |
| UI chat | [`src/components/chatbot/Chatbot.tsx`](../src/components/chatbot/Chatbot.tsx) | `usingOllama` / `processOllama`; si `/api/chat` no es OK, pasa a offline |
| Icono | [`src/components/chatbot/OllamaIcon.tsx`](../src/components/chatbot/OllamaIcon.tsx) | SVG de Ollama en el badge “IA” |
| Offline | [`src/lib/actionRegistry.ts`](../src/lib/actionRegistry.ts) | Regex / nombres de pacientes |
| Vistas | [`src/components/views/`](../src/components/views/) | Cards Tailwind azul/slate + emoji |
| Shell | [`src/app/page.tsx`](../src/app/page.tsx), [`layout.tsx`](../src/app/layout.tsx) | Fondo `zinc-50`, chat FAB, loader 400 ms |
| Loader | [`FullScreenLoader.tsx`](../src/components/views/FullScreenLoader.tsx) | Referencia a `/Robot Loader.svg` (archivo ausente en `public/`) |
| Backend | `server/` (Express :4000) | Auth, pacientes, turnos — **no toca la IA** |
| Docs producto | [`README.md`](../README.md), [`PLAN.md`](../PLAN.md), [`IDEA.md`](../IDEA.md) | Piden `ollama serve`; IDEA habla de OpenAI |

No hay paquetes npm de Ollama, OpenAI ni Google: solo `fetch` nativo.

InobaLab **no** llama Gemini desde Next.js. La IA vive en FastAPI (`LLMClient` → `{LLM_BASE_URL}/chat/completions`). En este repo se **adapta** ese cliente a TypeScript dentro de Next, no se copia el backend Python.

---

## Arquitectura objetivo

Gemini se consume desde la misma ruta `POST /api/chat`. Contrato HTTP igual que InobaLab:

- URL: `{LLM_BASE_URL}/chat/completions`
- Header: `Authorization: Bearer {LLM_API_KEY}`
- Body: `model`, `temperature: 0.1`, `response_format: { type: "json_object" }`, `messages` (system + historial + user)
- Respuesta: `choices[0].message.content` parseado como JSON

El servidor Express **no cambia**.

```mermaid
sequenceDiagram
  participant UI as Chatbot
  participant API as POST_api_chat
  participant G as Gemini_OpenAI_compat
  participant Off as actionRegistry

  UI->>API: message plus history
  alt LLM_API_KEY configurada
    API->>G: chat/completions JSON
    G-->>API: choices 0 message content
    API-->>UI: type view data message
  else sin key o error
    API-->>UI: 503 o false
    UI->>Off: resolveActionAsync
  end
```

Contrato de salida del API (igual que hoy):

```json
{
  "type": "respond | show_view",
  "view": "welcome | login | patients | patient_detail | appointment | report | null",
  "data": {},
  "message": "texto en español argentino"
}
```

---

## Variables de entorno

Solo servidor. **Nunca** `NEXT_PUBLIC_*` para la key.

Añadir [`.env.example`](../.env.example) en la raíz (key vacía). Usar `.env.local` en desarrollo. No commitear secretos.

| Variable | Default | Uso |
|----------|---------|-----|
| `LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai/` | Raíz OpenAI-compatible de Google |
| `LLM_API_KEY` | *(vacío)* | Key de Google AI Studio |
| `LLM_MODEL` | `gemini-2.0-flash` | Igual que InobaLab |
| `LLM_TIMEOUT_SECONDS` | `30` | Timeout del `fetch` |

Quitar `OLLAMA_URL` y `OLLAMA_MODEL`.

---

## Fase 1 — Quitar Ollama e integrar Gemini

### 1.1 Cliente LLM

Crear [`src/lib/llm.ts`](../src/lib/llm.ts) (espejo de `LLMClient` de InobaLab):

- Leer env, `isConfigured` = base URL + API key no vacíos.
- `completeJson({ systemPrompt, messages })`:
  - POST `{base}/chat/completions`
  - timeout con `AbortController`
  - parsear `choices[0].message.content` (string o lista de partes con `text`)
  - `JSON.parse` del content
- Si no está configurado o falla HTTP/JSON: error tipado para que la route devuelva 503.

No instalar `@google/generative-ai` ni otros SDKs.

### 1.2 Ruta de chat

Reescribir [`src/app/api/chat/route.ts`](../src/app/api/chat/route.ts):

- Conservar el **mismo** `SYSTEM_PROMPT` (vistas, rechazos, ejemplos, JSON).
- Si `!isConfigured` → `503`.
- Si hay key → Gemini con historial (últimos 10 turnos los sigue mandando el cliente).
- Usar `response_format: { type: "json_object" }`. Con JSON nativo, eliminar el regex `\{[\s\S]*\}` salvo fallback defensivo.
- Normalizar respuesta a `{ type, view, data, message }`.
- Logs: “LLM” / “Gemini”, no “Ollama”.

### 1.3 Chat UI

En [`src/components/chatbot/Chatbot.tsx`](../src/components/chatbot/Chatbot.tsx):

- `usingOllama` → `usingLlm`
- `processOllama` → `processLlm`
- Tipo `OllamaResponse` → `LlmResponse` (mismo shape)
- Badge “IA” sin marca Ollama
- Footer: `Modo offline — IA no disponible`

Eliminar [`src/components/chatbot/OllamaIcon.tsx`](../src/components/chatbot/OllamaIcon.tsx).

El fallback `resolveActionAsync` se mantiene cuando `/api/chat` no es OK.

### 1.4 Documentación de producto

- [`README.md`](../README.md): dos terminales (`dev:server` + `dev`). Quitar `ollama serve` y `ollama pull`. Documentar `.env.local` con `LLM_*`.
- [`PLAN.md`](../PLAN.md): Fase 5 = Gemini (API de Google), no Ollama local.
- [`IDEA.md`](../IDEA.md): stack IA = Gemini OpenAI-compatible, no “OpenAI + Function Calling”.

### 1.5 Fuera de alcance (Fase 1)

- Streaming / SSE
- Function calling nativo de Gemini
- SDK `@google/generative-ai`
- Backend Python
- Cambios en `server/`

---

## Fase 2 — Vistas más modernas

Mantener: una sola URL, panel que cambia por `ViewType`, chat flotante. **No** copiar branding GCBA, video hero ni logos de InobaLab.

### 2.1 Design tokens y shell

- [`src/app/globals.css`](../src/app/globals.css): paleta clínica (slate + teal/cyan), radios, sombras, malla de fondo sutil. Quitar que el `body` fuerce Arial.
- [`src/app/layout.tsx`](../src/app/layout.tsx): `font-sans` = Geist (`variable` ya existe).
- [`src/app/page.tsx`](../src/app/page.tsx): header sticky (nombre del sistema + vista activa + indicador de IA). Área de contenido con padding uniforme. El FAB del chat se queda.

### 2.2 Rediseño por vista (mismas props)

| Vista | Archivo | Dirección visual |
|--------|---------|------------------|
| Welcome | [`WelcomeView.tsx`](../src/components/views/WelcomeView.tsx) | Hero + chips de comandos clicables que disparen `onAction` o envíen el texto al chat (pasar callback; no dejar chips solo decorativos) |
| Login | [`LoginView.tsx`](../src/components/views/LoginView.tsx) | Card con labels claros, focus ring, ícono SVG (no emoji) |
| Turno | [`AppointmentView.tsx`](../src/components/views/AppointmentView.tsx) | Igual que login |
| Pacientes | [`PatientsView.tsx`](../src/components/views/PatientsView.tsx) | Tabla dashboard: avatar con inicial, badge de estado, hover, empty state ilustrado |
| Detalle | [`PatientDetailView.tsx`](../src/components/views/PatientDetailView.tsx) | Dos columnas: identidad + secciones clínicas |
| Informe | [`ReportView.tsx`](../src/components/views/ReportView.tsx) | Tres KPI cards + placeholder de gráfico (CSS/SVG; Recharts no es obligatorio) |

[`ViewRenderer.tsx`](../src/components/views/ViewRenderer.tsx): conservar el mapa `ViewType` → componente; ajustar transiciones si hace falta para el nuevo shell.

### 2.3 Chat

En `Chatbot.tsx`: panel más alto, header con estado IA/offline, burbujas alineadas (user vs bot), input tipo composer, chips de sugerencias rápidas. Reutilizar Framer Motion.

### 2.4 Loader

Reemplazar la imagen faltante `/Robot Loader.svg` en [`FullScreenLoader.tsx`](../src/components/views/FullScreenLoader.tsx) por spinner o esqueleto alineado al tema.

### 2.5 Fuera de alcance (Fase 2)

- Avatar Rive (Fase 6 histórica de `PLAN.md`)
- Modo oscuro completo
- Layout split “chat a la izquierda” de `IDEA.md`
- Conectar login/turnos de verdad al Express (siguen siendo formularios de demo)

---

## Orden de implementación sugerido

1. `src/lib/llm.ts` + env + reescritura de `route.ts`.
2. Chatbot: rename + quitar `OllamaIcon`.
3. README / PLAN / IDEA / `.env.example`.
4. Tokens + layout + header en `page.tsx`.
5. Cada vista + loader + pulido del chat.
6. Verificación en el navegador (abajo).

---

## Criterios de éxito

- No quedan `OLLAMA_*`, `OllamaIcon`, ni instrucciones de `ollama serve`.
- Con `LLM_API_KEY` el chat entiende lenguaje natural y cambia vistas (`show_view`).
- Sin key o error de Gemini: mismo fallback por keywords.
- Las vistas se ven como producto (no mock “card + emoji”).
- El backend Express sigue igual y el frontend sigue usando `NEXT_PUBLIC_API_URL` donde ya se usa.

---

## Verificación (cuando se ejecute el código)

En el navegador, como usuario:

1. Welcome (hero + chips).
2. Login, pacientes, detalle (p. ej. “mostrame maría”), turno, reporte — por chat y, si hay chips, por click.
3. Un turno con Gemini (key configurada): frase natural → vista correcta + mensaje en español.
4. Un turno offline (key vacía o API caída): keywords (`pacientes`, `login`, `turno`) siguen funcionando.
5. Transición de vista (loader/spinner, no imagen 404).
6. Chat: abrir/cerrar FAB, scroll de mensajes, estado IA vs offline.

Si no hay herramientas de browser en esa sesión, usar el servidor de Next + `curl` a `POST /api/chat` y dejar asentado qué no se pudo verificar visualmente.

---

## Riesgos y notas

- **Free tier de Gemini:** en Google AI Studio el uso gratuito puede entrenar modelos fuera de UE/UK/EEA. Este proyecto es un demo médico con datos mock; no enviar PHI real.
- **Key solo en servidor:** `route.ts` / `llm.ts` corren en Node. No exponer la key al cliente.
- **Timeouts:** default 30 s (InobaLab); Ollama usaba 60 s. Ajustar `LLM_TIMEOUT_SECONDS` si hace falta.
- **JSON:** `response_format: json_object` reduce respuestas con markdown; igual validar `type` / `view` en el cliente (`VALID_VIEWS` ya existe).
- **Modelo:** default `gemini-2.0-flash` para alinearse con InobaLab; se puede cambiar por env sin tocar código.

---

## Archivos a tocar (checklist)

**Fase 1**

- [ ] Crear `src/lib/llm.ts`
- [ ] Crear `.env.example`
- [ ] Editar `src/app/api/chat/route.ts`
- [ ] Editar `src/components/chatbot/Chatbot.tsx`
- [ ] Eliminar `src/components/chatbot/OllamaIcon.tsx`
- [ ] Editar `README.md`, `PLAN.md`, `IDEA.md`

**Fase 2**

- [ ] Editar `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`
- [ ] Editar todas las vistas en `src/components/views/`
- [ ] Editar `FullScreenLoader.tsx` y `ViewRenderer.tsx` si aplica
- [ ] Pulir `Chatbot.tsx` (composer, sugerencias, header)
