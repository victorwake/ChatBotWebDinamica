import type { Action } from "@/types"

export type RegistryAction = Action & { label: string }

export const HELP_LABELS = [
  "ayuda",
  "opciones",
  "comandos",
  "que puedo hacer",
  "menu",
  "listame las opciones",
  "necesito ayuda",
]

type Handler = (input: string) => RegistryAction | null

const registry: Record<string, Handler> = {
  login(input) {
    if (/\b(?:login|iniciar\s*s[eé]sion|logue[ea]r(?:me|se|te)?|ingresar|acceder|entrar)\b/i.test(input))
      return { href: "/login", label: "Ir al login" }
    return null
  },
  patients(input) {
    if (/\b(?:pacientes\b|lista\s*pacientes\b|ver\s*pacientes\b|todos\s*los\s*pacientes\b)/i.test(input))
      return { href: "/patients", label: "Lista de pacientes" }
    return null
  },
  appointments(input) {
    if (/\b(?:turnos?|agendar|citas?|reservar|nuevo\s*turno|sac[ae]r\s*turno)\b/i.test(input))
      return { href: "/appointments", label: "Ver turnos" }
    return null
  },
  consultations(input) {
    if (/\b(?:historia|historial|ficha|consultas?|atenci[oó]n(?:es)?)\b/i.test(input))
      return { href: "/consultations", label: "Ver atenciones clínicas" }
    return null
  },
  home(input) {
    if (/\b(?:inicio|volver|home|welcome|principal)\b/i.test(input))
      return { href: "/", label: "Volver al inicio" }
    return null
  },
}

export function resolveAction(input: string): RegistryAction | null {
  const cleaned = input.replace(/[^\w\sáéíóúüñ]/gi, "").trim()

  for (const handler of Object.values(registry)) {
    const action = handler(cleaned)
    if (action) return action
  }
  return null
}

export function formatHelp(): string {
  const items = [
    "🔐  **login** — iniciar sesión",
    "👥  **pacientes** — ver pacientes",
    "📅  **turno** — consultar o agendar turnos",
    "🩺  **atenciones** — consultar atenciones clínicas",
    "🏠  **inicio** — volver al menú principal",
  ]
  return "📋 **Comandos disponibles**:\n" + items.map((item) => "\n" + item).join("")
}

export function getBotResponse(input: string, resolvedAction?: RegistryAction | null): string {
  const cleaned = input.replace(/[^\w\sáéíóúüñ]/gi, "").trim()
  const normalized = cleaned.toLowerCase()

  if (HELP_LABELS.some((label) => normalized.includes(label))) return formatHelp()
  if (/\b(?:hola|buenas|buen[ao]s\s*d[ií]as|qu[eé]\s*tal|hey)\b/i.test(cleaned))
    return "¡Hola! " + formatHelp()
  if (/\b(?:gracias|thanks|vale|ok|okey|perfecto|entendido)\b/i.test(cleaned))
    return "¡De nada! Cualquier cosa me decís."

  const action = resolvedAction === undefined ? resolveAction(cleaned) : resolvedAction
  const actionMessages: Record<Action["href"], string> = {
    "/": "Volviste al inicio.",
    "/login": "Te llevo al formulario de inicio de sesión.",
    "/patients": "Acá tenés la lista de pacientes.",
    "/appointments": "Te llevo a turnos para consultar disponibilidad y solicitar uno.",
    "/consultations": "Te llevo a las atenciones clínicas.",
  }

  return action ? actionMessages[action.href] : "No entendí bien. Escribí **ayuda** para ver los comandos."
}
