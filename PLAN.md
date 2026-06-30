# Plan de Desarrollo por Fases

## Fase 0 — Setup del proyecto

**Objetivo**: Tener el proyecto base funcionando con Next.js, Tailwind y la estructura de carpetas.

### Tareas

- [ ] Inicializar proyecto Next.js con TypeScript
- [ ] Configurar Tailwind CSS
- [ ] Crear estructura de carpetas:

```
src/
├── components/
│   ├── chatbot/
│   ├── views/
│   ├── layout/
│   └── ui/
├── actions/          # Acciones que la IA puede disparar
├── data/             # Datos simulados
├── types/            # Tipos TypeScript
└── app/
    ├── page.tsx
    └── layout.tsx
```

- [ ] Crear layout base: chatbot a la izquierda, panel principal a la derecha
- [ ] Verificar que se ve el split screen en el navegador
- [ ] Subir a Git

---

## Fase 1 — Chatbot simulado + vistas estáticas

**Objetivo**: Lograr el efecto conversación → cambio de vista. Sin IA real, sin API real.

### Tareas

- [ ] Crear componente `Chatbot` con:
  - Input de texto
  - Burbujas de mensajes (usuario y bot)
  - Scroll automático
- [ ] Definir tipos base:

```ts
type ViewType = "welcome" | "login" | "patients" | "patient_detail" | "appointment" | "report"
type Action = { view: ViewType; data?: any }
```

- [ ] Crear vistas (componentes placeholder):
  - `WelcomeView` — avatar + mensaje de bienvenida
  - `LoginView` — formulario de login
  - `PatientsView` — tabla de pacientes simulados
  - `PatientDetailView` — ficha de paciente
  - `AppointmentView` — formulario de turno
  - `ReportView` — informe genérico
- [ ] Implementar `ViewRenderer` — recibe una acción y renderiza la vista correspondiente
- [ ] Conectar chatbot → acciones simuladas:
  - Si usuario escribe "login" → `{ view: "login" }`
  - Si usuario escribe "pacientes" → `{ view: "patients" }`
  - Si usuario escribe "juan" → `{ view: "patient_detail", data: { id: 1 } }`
- [ ] **Checkpoint**: el usuario escribe en el chat y el panel cambia

### Criterio de éxito

> Escribís en el chat, el bot responde, y el panel principal cambia su contenido.

---

## Fase 2 — Transiciones y animaciones (sin Rive aún)

**Objetivo**: Que los cambios de vista se sientan fluidos.

### Tareas

- [ ] Instalar Framer Motion
- [ ] Envolver `ViewRenderer` con `AnimatePresence`
- [ ] Agregar animaciones de entrada/salida:
  - Slide horizontal
  - Fade
  - Scale
- [ ] Botón de "escribiendo..." en el chatbot cuando simula respuesta
- [ ] Transiciones suaves en el formulario de login (inputs aparecen uno a uno)
- [ ] **Checkpoint**: el cambio de vistas se ve profesional

---

## Fase 3 — Datos simulados y lógica de acciones

**Objetivo**: Que las vistas muestren datos realistas y la lógica sea extensible.

### Tareas

- [ ] Crear carpeta `data/` con:
  - `patients.ts` — array de 10 pacientes simulados
  - `appointments.ts` — turnos simulados
  - `users.ts` — usuarios para login
- [ ] Crear `actions/actionRegistry.ts`:
  - Sistema de registro de acciones por tipo
  - Cada acción recibe `(data, context)` y devuelve `{ view, props }`
- [ ] Implementar acciones concretas:
  - `login` — valida contra `users.ts`
  - `listPatients` — devuelve pacientes simulados
  - `getPatientDetail` — busca por ID/nombre
  - `createAppointment` — crea turno simulado
- [ ] Conectar chatbot al action registry
- [ ] **Checkpoint**: el chatbot puede hacer login simulado, listar pacientes, ver detalle

---

## Fase 4 — Backend Node.js + Express

**Objetivo**: Reemplazar datos simulados con llamadas a una API real.

### Tareas

- [ ] Crear carpeta `/server` con Express + TypeScript
- [ ] Endpoints REST:
  - `POST /api/auth/login`
  - `GET /api/patients`
  - `GET /api/patients/:id`
  - `POST /api/appointments`
- [ ] Conectar frontend:
  - Servicio `api/client.ts` con fetch
  - Loading states en las vistas
  - Manejo de errores (mostrar en chatbot)
- [ ] **Checkpoint**: el frontend consume datos reales del backend

---

## Fase 5 — Integración con OpenAI

**Objetivo**: Que el chatbot entienda lenguaje natural y devuelva acciones.

### Tareas

- [ ] Crear API route en Next.js: `POST /api/chat`
- [ ] Configurar OpenAI SDK
- [ ] Definir tools/function calling:

```json
{
  "name": "show_view",
  "parameters": {
    "view": "login | patients | patient_detail | appointment",
    "data": {}
  }
}
```

- [ ] Enviar mensaje del usuario → OpenAI → recibe `show_view` → renderiza componente
- [ ] Agregar contexto: el bot "recuerda" el estado actual
- [ ] **Checkpoint**: el chatbot entiende frases como "mostrar pacientes de hoy"

---

## Fase 6 — Rive (animaciones del avatar)

**Objetivo**: Agregar el avatar animado que reacciona a la conversación.

### Tareas

- [ ] Instalar `@rive-app/react-canvas`
- [ ] Crear componente `Avatar` que carga un archivo `.riv`
- [ ] Definir estados de animación:
  - `idle` — reposo
  - `thinking` — pensando (mientras carga/responde)
  - `success` — operación exitosa
  - `error` — cuando algo falla
  - `transition` — cuando cambia la vista
- [ ] Conectar estados al flujo de acciones
- [ ] Posicionar avatar en el panel principal o sobre el chatbot
- [ ] **Nota**: Los archivos `.riv` deben crearse en rive.app. No se generan desde código.

---

## Fase 7 — Mejora de experiencia

**Objetivo**: Pulir la experiencia hasta que se sienta como una app moderna.

### Tareas

- [ ] Agregar sugerencias de comandos en el chatbot
- [ ] Atajos: clicks en mensajes del bot ejecutan acciones
- [ ] Historial de conversación persistente (localStorage)
- [ ] Modo oscuro
- [ ] Responsive: en mobile el chatbot se convierte en overlay
- [ ] Testing:
  - Unit tests con Vitest
  - E2E con Playwright
- [ ] Loaders esqueletales en las vistas

---

## Fase 8 — Producción

**Objetivo**: Deploy y monitoreo.

### Tareas

- [ ] Variables de entorno para API keys
- [ ] Dockerizar frontend + backend
- [ ] Deploy en Vercel (frontend) + Railway/Render (backend)
- [ ] Rate limiting en API
- [ ] Logging
- [ ] Analytics de uso (qué acciones usa más la gente)

---

## Resumen visual del plan

```
Fase 0  ████████████████░░░░░░░░░░░░  Setup
Fase 1  ████████████████████░░░░░░░░  Chatbot + vistas
Fase 2  ████████████████████████░░░░  Transiciones
Fase 3  ████████████████████████████  Datos simulados
Fase 4  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Backend real
Fase 5  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░  OpenAI
Fase 6  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Rive
Fase 7  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░  UX
Fase 8  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░  Producción
```

> **Leyenda**: █ = completado, ░ = pendiente

## Recomendación de orden

1. Hacé **Fase 0 y 1** en un día — es el core del concepto.
2. **Fase 2** al día siguiente — le da calidad visual.
3. **Fase 3** después — consolida la lógica.
4. Las fases 4, 5, 6 son intercambiables según prioridad.
5. Dejá 7 y 8 para el final.
