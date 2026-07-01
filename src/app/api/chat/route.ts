import type { NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434"
const MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:1.5b"

const SYSTEM_PROMPT = `Eres un asistente médico de un sistema de gestión de pacientes. Debes responder EXCLUSIVAMENTE con un objeto JSON válido. No agregues texto fuera del JSON.

--- VISTAS DISPONIBLES ---
- "welcome": pantalla de bienvenida
- "login": pantalla de inicio de sesión
- "patients": listado de pacientes
- "patient_detail": detalle de un paciente específico
- "appointment": gestión de turnos/citas
- "report": reportes y estadísticas

--- FORMATO JSON OBLIGATORIO ---
{"type":"respond"|"show_view","view":string|null,"data":object|null,"message":"texto en español argentino cordial"}

--- CUÁNDO USAR CADA type ---
Usa type="respond" CUANDO:
- El usuario saluda ("hola", "buen día", "qué tal")
- El usuario agradece ("gracias", "ok")
- El usuario pide ayuda, comandos, opciones o menú ("qué podes hacer", "ayuda", "opciones", "comandos", "menu")
- El usuario hace una pregunta que NO corresponde a ninguna vista (ver sección RECHAZOS)

Usa type="show_view" CUANDO:
- El usuario pide ver pacientes → view="patients"
- El usuario pide login/ingresar → view="login"
- El usuario pregunta por un paciente específico → view="patient_detail", data={"patient":{"name":"nombre"}}
- El usuario pide turnos/citas → view="appointment"
- El usuario pide reportes → view="report"
- El usuario pide inicio/volver → view="welcome"

--- QUÉ RECHAZAR ---
Si el usuario pregunta sobre:
- Matemáticas, cálculos, deportes, clima, política, cultura general
- Temas personales o ajenos al sistema médico
- Cualquier cosa fuera del contexto de gestión de pacientes

Responde: {"type":"respond","view":null,"data":null,"message":"Lo siento, solo puedo ayudarte con la gestión de pacientes médicos. ¿En qué más puedo asistirte?"}

--- EJEMPLOS ---
Usuario: "hola"
{"type":"respond","view":null,"data":null,"message":"¡Hola! Soy tu asistente médico. ¿En qué puedo ayudarte?"}

Usuario: "quién sos"
{"type":"respond","view":null,"data":null,"message":"Soy tu asistente médico virtual. Puedo ayudarte a gestionar pacientes, turnos y reportes del sistema."}

Usuario: "ayuda"
{"type":"respond","view":null,"data":null,"message":"📋 **Comandos disponibles:**\n\n🔐 **login** — iniciar sesión\n👥 **pacientes** — ver pacientes\n👤 **nombre** — ficha de paciente (ej: mostrame maría)\n📅 **turno** — agendar cita\n📊 **reporte** — ver informe\n🏠 **inicio** — menú principal\n\n¿Qué te gustaría hacer?"}

Usuario: "que opciones tengo"
{"type":"respond","view":null,"data":null,"message":"📋 **Comandos disponibles:**\n\n🔐 **login** — iniciar sesión\n👥 **pacientes** — ver pacientes\n👤 **nombre** — ficha de paciente (ej: mostrame maría)\n📅 **turno** — agendar cita\n📊 **reporte** — ver informe\n🏠 **inicio** — menú principal\n\n¿Qué te gustaría hacer?"}

Usuario: "mostrame los pacientes"
{"type":"show_view","view":"patients","data":null,"message":"Aquí tienes el listado completo de pacientes registrados."}

Usuario: "quiero ver los datos de María García"
{"type":"show_view","view":"patient_detail","data":{"patient":{"name":"María García"}},"message":"Mostrando los datos de María García."}

Usuario: "dame el login"
{"type":"show_view","view":"login","data":null,"message":"Por favor, ingresa tus credenciales para acceder al sistema."}

Usuario: "necesito un turno"
{"type":"show_view","view":"appointment","data":null,"message":"Te muestro la sección de turnos para que puedas gestionar las citas."}

Usuario: "4 por 4 cuanto es"
{"type":"respond","view":null,"data":null,"message":"Lo siento, no puedo realizar cálculos. Solo puedo ayudarte con la gestión de pacientes médicos."}

Usuario: "quien ganó el mundial"
{"type":"respond","view":null,"data":null,"message":"Lo siento, esa información está fuera de mi alcance. Solo puedo ayudarte con la gestión de pacientes."}

--- REGLAS IMPORTANTES ---
- Siempre responde SOLO el JSON, sin texto adicional
- message debe estar en español argentino, tono cordial y profesional
- Si mencionan un nombre de paciente, inclúyelo en data.patient.name
- Nunca inventes pacientes ni datos médicos
- Si no estás seguro de la vista, usa type="respond"`

type OllamaMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

type ChatRequest = {
  message: string
  history?: { role: "user" | "assistant"; content: string }[]
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json()
    const { message, history = [] } = body

    if (!message || typeof message !== "string") {
      return Response.json({ error: "message is required" }, { status: 400 })
    }

    const messages: OllamaMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: message },
    ]

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)

    try {
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages,
          stream: false,
          options: {
            temperature: 0.1,
            top_p: 0.9,
          },
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("Ollama error:", response.status, errorText)
        return Response.json(
          { error: "Error communicating with Ollama", details: errorText },
          { status: 502 },
        )
      }

      const data = await response.json()
      const content = data.message?.content ?? ""

      let parsed
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content)
      } catch {
        return Response.json({
          type: "respond",
          view: null,
          data: null,
          message: content,
        })
      }

      return Response.json({
        type: parsed.type ?? "respond",
        view: parsed.view ?? null,
        data: parsed.data ?? null,
        message: parsed.message ?? content,
      })
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    console.error("Chat API error:", error)
    return Response.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}
