import type { NextRequest } from "next/server"
import { completeJson, getLlmConfig, LlmUnavailableError } from "@/lib/llm"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SYSTEM_PROMPT = `Sos el asistente de un sistema de gestión de consultorio. Respondé exclusivamente con un objeto JSON válido con la forma {"message":"respuesta breve en español argentino"}.

Podés responder saludos, agradecimientos y explicar que el sistema permite iniciar sesión, consultar pacientes, turnos y atenciones clínicas. No afirmes que realizaste consultas, reservas o cambios. No inventes datos personales, clínicos ni resultados.

Las solicitudes para abrir secciones se gestionan por la aplicación, no por vos. Nunca devuelvas rutas, nombres de pantallas, datos de pacientes ni instrucciones para saltar permisos. Para temas ajenos al consultorio, explicá cordialmente que solo podés ayudar con el sistema.`

type ChatRequest = {
  message: string
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json()
    const { message } = body

    if (!message || typeof message !== "string") {
      return Response.json({ error: "message is required" }, { status: 400 })
    }

    if (!getLlmConfig().isConfigured) {
      return Response.json({ error: "LLM not configured" }, { status: 503 })
    }

    const parsed = await completeJson({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", content: message }],
    })
    if (typeof parsed.message !== "string" || !parsed.message.trim()) {
      throw new LlmUnavailableError("LLM returned an invalid response")
    }

    return Response.json({ message: parsed.message })
  } catch (error) {
    if (error instanceof LlmUnavailableError) {
      console.error("Gemini unavailable:", error.message)
      return Response.json({ error: "Error communicating with Gemini", details: error.message }, { status: 502 })
    }
    console.error("Chat API error:", error)
    return Response.json({ error: "Internal server error" }, { status: 500 })
  }
}
