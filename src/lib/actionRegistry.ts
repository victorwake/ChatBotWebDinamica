import type { Action } from "@/types"
import { mockPatients, type Patient } from "@/data/mockPatients"

export type RegistryAction = Action & { label: string; pendingPatients?: Patient[] }

function normalizeStr(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

const COMMANDS = [
  { cmd: "login", desc: "iniciar sesión" },
  { cmd: "pacientes", desc: "ver listado de pacientes" },
  { cmd: "nombre", desc: "ficha (ej: mostrame maría, datos de juan)" },
  { cmd: "turno", desc: "agendar una cita" },
  { cmd: "reporte", desc: "ver informe" },
  { cmd: "inicio / volver", desc: "menú principal" },
]

const HELP_LABELS = ["ayuda", "opciones", "comandos", "que puedo hacer", "menu", "listame las opciones", "necesito ayuda"]

const registry: Record<string, (input: string) => RegistryAction | null> = {
  login(input) {
    if (/\b(?:login|iniciar\s*s[eé]sion|logue[ea]r(?:me|se|te)?|ingresar|acceder|entrar)\b/i.test(input))
      return { view: "login", label: "Ir al login" }
    return null
  },
  patients(input) {
    if (/\b(?:pacientes\b|lista\s*pacientes\b|ver\s*pacientes\b|todos\s*los\s*pacientes\b)/i.test(input))
      return { view: "patients", data: { patients: mockPatients }, label: "Lista de pacientes" }
    return null
  },
  patientDetail(input) {
    function firstWord(name: string) { return normalizeStr(name).split(" ")[0] }

    const extractName = (text: string): string | null => {
      const triggers = [
        /(?:mostrame?|buscame?|traeme?|dame?|muestra|ense[ñn]ame?)\s+(?:los\s+)?(?:datos|info|informaci[óo]n|ficha|detalles?)?\s*(?:de|l?[dl]?)\s*(.+)/i,
        /(?:quiero|necesito)\s+(?:ver|saber|buscar|conocer|encontrar)\s+(?:los\s+)?(?:datos|info|informaci[óo]n|ficha|detalles?)?\s*(?:de|l?[dl]?)?\s*(.+)/i,
        /(?:ficha|datos|detalle|informaci[óo]n|informe)\s+(?:de|l?[dl]?)?\s*(.+)/i,
        /(?:b[úu]scame?|buscar)\s+(?:al?)?\s*(.+)/i,
      ]
      for (const pattern of triggers) {
        const m = text.match(pattern)
        if (m) {
          let name = m[1].trim()
          name = name.replace(/^(?:del?|l[aeo]s?|l[aeo]|al|paciente|se[nñ]ora?|doctor[a]?|dr[a]?\.?)\s+/i, "").trim()
          if (name.length >= 2) return name
        }
      }
      return null
    }

    let searchTerm = extractName(input)
    if (searchTerm) {
      const matches = mockPatients.filter((p) => normalizeStr(p.name).includes(normalizeStr(searchTerm!))
      )
      if (matches.length === 1)
        return { view: "patient_detail", data: { patient: matches[0] }, label: `Ficha de ${matches[0].name}` }
      if (matches.length > 1)
        return { view: "patient_detail", label: `Elegí un paciente`, pendingPatients: matches }
    }

    const firstWords = [...new Set(mockPatients.map((p) => firstWord(p.name)))]
    for (const fw of firstWords) {
      if (normalizeStr(input).includes(fw) || fw.includes(normalizeStr(input).split(" ")[0])) {
        const matches = mockPatients.filter((p) => firstWord(p.name) === fw)
        if (matches.length === 1)
          return { view: "patient_detail", data: { patient: matches[0] }, label: `Ficha de ${matches[0].name}` }
        if (matches.length > 1)
          return { view: "patient_detail", label: `Elegí un paciente`, pendingPatients: matches }
      }
    }

    return null
  },
  appointment(input) {
    if (/\b(?:turno|agendar|cita|reservar|nuevo\s*turno|sac[ae]r\s*turno)\b/i.test(input))
      return { view: "appointment", label: "Agendar turno" }
    return null
  },
  report(input) {
    if (/\b(?:informe?|reporte?|report|informe?\s*m[eé]dico)\b/i.test(input))
      return { view: "report", label: "Ver informe" }
    return null
  },
  welcome(input) {
    if (/\b(?:inicio|volver|home|welcome|menu|principal)\b/i.test(input))
      return { view: "welcome", label: "Volver al inicio" }
    return null
  },
}

export function getDisambiguationMessage(patients: Patient[]): string {
  const surnames = patients.map((p) => p.name.split(" ").slice(1).join(" "))
  const name = patients[0].name.split(" ")[0]
  return `Encontré **${patients.length}** pacientes llamados **${name}**: ${surnames.join(", ")}.\n\nDecime el **apellido** para ver la ficha.`
}

export function formatHelp(): string {
  const items = [
    "🔐  **login** — iniciar sesión",
    "👥  **pacientes** — ver pacientes",
    "👤  **nombre** — ficha (ej: mostrame maría, datos de juan)",
    "📅  **turno** — agendar cita",
    "📊  **reporte** — ver informe",
    "🏠  **inicio** — menú principal",
  ]
  return "📋 **Comandos disponibles**:\n" + items.map((i) => "\n" + i).join("")
}

export function resolveAction(input: string): RegistryAction {
  const cleaned = input.replace(/[^\w\sáéíóúüñ]/gi, "").trim()
  for (const handler of Object.values(registry)) {
    const result = handler(cleaned)
    if (result) return result
  }
  return { view: "welcome", label: "No entendí — volviendo al inicio" }
}

export function getBotResponse(input: string): string {
  const cleaned = input.replace(/[^\w\sáéíóúüñ]/gi, "").trim()

  if (HELP_LABELS.some((w) => cleaned.toLowerCase().includes(w)))
    return formatHelp()
  if (/\b(?:hola|buenas|buen[ao]s\s*d[ií]as|qu[eé]\s*tal|hey)\b/i.test(cleaned))
    return "¡Hola! " + formatHelp()
  if (/\b(?:gracias|thanks|vale|ok|okey|perfecto|entendido)\b/i.test(cleaned))
    return "¡De nada! Cualquier cosa me decís."

  const resolved = resolveAction(cleaned)
  const actionMap: Record<string, string> = {
    login: "Te llevo al formulario de inicio de sesión.",
    patients: "Acá tenés la lista de pacientes.",
    patient_detail: "Mostrando la ficha del paciente.",
    appointment: "Vamos a agendar un turno.",
    report: "Generando el informe.",
    welcome: "Volviste al inicio.",
  }
  return actionMap[resolved.view] ?? "No entendí bien. Escribí **ayuda** para ver los comandos."
}
