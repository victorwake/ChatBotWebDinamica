import type { Action } from "@/types"
import type { Patient } from "@/data/mockPatients"
import { demoDataEnabled, loadDemoPatients } from "@/lib/demo-data"

export type RegistryAction = Action & { label: string; pendingPatients?: Patient[] }

function normalizeStr(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

export const HELP_LABELS = ["ayuda", "opciones", "comandos", "que puedo hacer", "menu", "listame las opciones", "necesito ayuda"]

type Handler = (input: string) => RegistryAction | null
const registry: Record<string, Handler> = {
  login(input) {
    if (/\b(?:login|iniciar\s*s[eé]sion|logue[ea]r(?:me|se|te)?|ingresar|acceder|entrar)\b/i.test(input))
      return { view: "login", label: "Ir al login" }
    return null
  },
  patients(input) {
    if (/\b(?:pacientes\b|lista\s*pacientes\b|ver\s*pacientes\b|todos\s*los\s*pacientes\b)/i.test(input))
      return { view: "patients", label: "Lista de pacientes" }
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

async function resolvePatientDetail(input: string): Promise<RegistryAction | null> {
  if (!demoDataEnabled) return null

  const all = await loadDemoPatients()
  const firstWord = (name: string) => normalizeStr(name).split(" ")[0]
  const triggers = [
    /(?:mostrame?|buscame?|traeme?|dame?|muestra|ense[ñn]ame?)\s+(?:los\s+)?(?:datos|info|informaci[óo]n|ficha|detalles?)?\s*(?:de|l?[dl]?)\s*(.+)/i,
    /(?:quiero|necesito)\s+(?:ver|saber|buscar|conocer|encontrar)\s+(?:los\s+)?(?:datos|info|informaci[óo]n|ficha|detalles?)?\s*(?:de|l?[dl]?)?\s*(.+)/i,
    /(?:ficha|datos|detalle|informaci[óo]n|informe)\s+(?:de|l?[dl]?)?\s*(.+)/i,
    /(?:b[úu]scame?|buscar)\s+(?:al?)?\s*(.+)/i,
  ]
  let searchTerm: string | null = null

  for (const pattern of triggers) {
    const match = input.match(pattern)
    if (!match) continue
    const candidate = match[1]
      .trim()
      .replace(/^(?:del?|l[aeo]s?|l[aeo]|al|paciente|se[nñ]ora?|doctor[a]?|dr[a]?\.?)\s+/i, "")
      .trim()
    if (candidate.length >= 2) {
      searchTerm = candidate
      break
    }
  }

  if (searchTerm) {
    const matches = all.filter((patient) =>
      normalizeStr(patient.name).includes(normalizeStr(searchTerm)),
    )
    if (matches.length === 1) {
      return {
        view: "patient_detail",
        data: { patient: matches[0] },
        label: `Ficha de ${matches[0].name}`,
      }
    }
    if (matches.length > 1) {
      return { view: "patient_detail", label: "Elegí un paciente", pendingPatients: matches }
    }
  }

  const normalizedInput = normalizeStr(input)
  const fullNameMatch = all.find((patient) =>
    normalizedInput.includes(normalizeStr(patient.name)),
  )
  if (fullNameMatch) {
    return {
      view: "patient_detail",
      data: { patient: fullNameMatch },
      label: `Ficha de ${fullNameMatch.name}`,
    }
  }

  const firstWords = [...new Set(all.map((patient) => firstWord(patient.name)))]
  for (const name of firstWords) {
    if (!normalizedInput.includes(name) && !name.includes(normalizedInput.split(" ")[0])) continue
    const matches = all.filter((patient) => firstWord(patient.name) === name)
    if (matches.length === 1) {
      return {
        view: "patient_detail",
        data: { patient: matches[0] },
        label: `Ficha de ${matches[0].name}`,
      }
    }
    if (matches.length > 1) {
      return { view: "patient_detail", label: "Elegí un paciente", pendingPatients: matches }
    }
  }

  return null
}

export async function resolveActionAsync(input: string): Promise<RegistryAction> {
  const cleaned = input.replace(/[^\w\sáéíóúüñ]/gi, "").trim()
  const patientDetail = await resolvePatientDetail(cleaned)
  if (patientDetail) return patientDetail

  const parsed = new Map(Object.entries(registry).map(([k, h]) => [k, h(cleaned)]))

  for (const [, action] of parsed) {
    if (!action) continue
    if (action.view === "patients" && demoDataEnabled) {
      action.data = { patients: await loadDemoPatients() }
    }
    return action
  }
  return { view: "welcome", label: "No entendí — volviendo al inicio" }
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

export function getBotResponse(input: string, resolvedAction?: RegistryAction): string {
  const cleaned = input.replace(/[^\w\sáéíóúüñ]/gi, "").trim()

  if (HELP_LABELS.some((w) => cleaned.toLowerCase().includes(w)))
    return formatHelp()
  if (/\b(?:hola|buenas|buen[ao]s\s*d[ií]as|qu[eé]\s*tal|hey)\b/i.test(cleaned))
    return "¡Hola! " + formatHelp()
  if (/\b(?:gracias|thanks|vale|ok|okey|perfecto|entendido)\b/i.test(cleaned))
    return "¡De nada! Cualquier cosa me decís."

  const actionMap: Record<string, string> = {
    login: "Te llevo al formulario de inicio de sesión.",
    patients: "Acá tenés la lista de pacientes.",
    patient_detail: "Mostrando la ficha del paciente.",
    appointment: "Vamos a agendar un turno.",
    report: "Generando el informe.",
    welcome: "Volviste al inicio.",
  }
  const resolved = resolvedAction ?? registryMatch(cleaned)
  return actionMap[resolved?.view ?? ""] ?? "No entendí bien. Escribí **ayuda** para ver los comandos."
}

function registryMatch(input: string): RegistryAction | null {
  for (const handler of Object.values(registry)) {
    const result = handler(input)
    if (result) return result
  }
  return null
}
