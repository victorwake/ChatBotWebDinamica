export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LlmUnavailableError"
  }
}

export type LlmMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type LlmConfig = {
  baseUrl: string
  apiKey: string
  model: string
  timeoutSeconds: number
  isConfigured: boolean
}

export function getLlmConfig(): LlmConfig {
  const baseUrl = (process.env.LLM_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai/").replace(
    /\/+$/,
    "",
  )
  const apiKey = process.env.LLM_API_KEY ?? ""
  const model = process.env.LLM_MODEL ?? "gemini-2.0-flash"
  const timeoutSeconds = Number(process.env.LLM_TIMEOUT_SECONDS ?? "30") || 30

  return {
    baseUrl,
    apiKey,
    model,
    timeoutSeconds,
    isConfigured: Boolean(baseUrl && apiKey),
  }
}

function extractContent(data: unknown): string {
  const content = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content

  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "")
        }
        return ""
      })
      .join("")
  }
  return ""
}

export async function completeJson({
  systemPrompt,
  messages,
}: {
  systemPrompt: string
  messages: LlmMessage[]
}): Promise<Record<string, unknown>> {
  const config = getLlmConfig()
  if (!config.isConfigured) {
    throw new LlmUnavailableError("LLM_BASE_URL / LLM_API_KEY not configured")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutSeconds * 1000)

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("LLM error:", response.status, errorText)
      throw new LlmUnavailableError(`LLM HTTP ${response.status}`)
    }

    const data: unknown = await response.json()
    const content = extractContent(data)

    try {
      return JSON.parse(content) as Record<string, unknown>
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) return JSON.parse(jsonMatch[0]) as Record<string, unknown>
      throw new LlmUnavailableError("LLM returned invalid JSON")
    }
  } catch (error) {
    if (error instanceof LlmUnavailableError) throw error
    if (error instanceof Error && error.name === "AbortError") {
      throw new LlmUnavailableError("LLM request timed out")
    }
    console.error("LLM request failed:", error)
    throw new LlmUnavailableError("LLM request failed")
  } finally {
    clearTimeout(timeout)
  }
}
