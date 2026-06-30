# ChatBotWebDinamica

## Concepto

Sistema médico donde **no hay navegación tradicional**. El usuario conversa con un chatbot y la interfaz se transforma dinámicamente en el panel principal según lo que pide, todo sin recargar la página ni cambiar de URL.

## Arquitectura General

```
┌─────────────────────────────────────────────┐
│                   Pantalla                    │
├──────────────┬──────────────────────────────┤
│              │                              │
│   Chatbot    │   Panel Principal            │
│   (fijo)     │   (dinámico)                 │
│              │                              │
│              │   ┌──────────────────────┐   │
│              │   │                      │   │
│              │   │   Avatar Rive        │   │
│              │   │   (animado)          │   │
│              │   │                      │   │
│              │   └──────────────────────┘   │
│              │                              │
│              │   ┌──────────────────────┐   │
│              │   │                      │   │
│              │   │   Contenido          │   │
│              │   │   (login, tabla,     │   │
│              │   │    ficha, etc.)      │   │
│              │   │                      │   │
│              │   └──────────────────────┘   │
│              │                              │
├──────────────┴──────────────────────────────┤
│              Barra de estado                │
└─────────────────────────────────────────────┘
```

### Flujo de datos

```
Usuario
   │
   ▼
Chatbot (interfaz de chat)
   │
   ▼
Mensaje → OpenAI (simulado en fases iniciales)
   │
   ▼
Acción JSON: { "action": "show_patients", "data": {...} }
   │
   ▼
React interpreta la acción
   │
   ├── Cambia el estado de la vista
   ├── Renderiza el componente adecuado
   ├── Dispara animación en Rive (cuando esté integrado)
   └── Transición fluida del panel principal
```

## Stack Tecnológico

| Capa        | Tecnología                        |
| ----------- | --------------------------------- |
| Frontend    | React + Next.js + TypeScript      |
| Estilos     | Tailwind CSS                      |
| Animaciones | Rive.js + Framer Motion           |
| Backend     | Node.js + Express                 |
| IA          | OpenAI API + Function Calling     |
| Estado      | React Context / Zustand           |

## Experiencia de Usuario

1. El usuario entra y ve el chatbot + avatar animado.
2. Escribe: *"Quiero iniciar sesión"*.
3. El chatbot responde, el avatar hace una transición, y aparece un formulario de login.
4. Escribe: *"Usuario: admin, Contraseña: 123"*.
5. El chatbot procesa, el avatar muestra "pensando", y se autentica.
6. Escribe: *"Mostrar pacientes de hoy"*.
7. El login desaparece con animación, aparece una tabla con pacientes.
8. Escribe: *"Historial de Juan Pérez"*.
9. La tabla se transforma en una ficha clínica.
10. Todo sin recargar ni cambiar de URL.

## Mejoras Futuras con Rive

- Avatar que reacciona: pensando, feliz, error, procesando.
- Transiciones animadas entre vistas.
- El panel principal se pliega/despliega con morphing.
- Micro-interacciones en cada componente.
