"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import type { Message, Action, ViewType } from "@/types"
import type { Patient } from "@/data/mockPatients"
import { resolveActionAsync, getBotResponse, getDisambiguationMessage, formatHelp, HELP_LABELS } from "@/lib/actionRegistry"
import type { RegistryAction } from "@/lib/actionRegistry"

const dots = [0, 1, 2]

const SUGGESTIONS = [
  { label: "Pacientes", text: "mostrame los pacientes" },
  { label: "Login", text: "login" },
  { label: "Turno", text: "necesito un turno" },
  { label: "Informe", text: "reporte" },
]

function renderText(text: string) {
  const html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>")
  return html
}

function matchSurname(input: string, patients: Patient[]): Patient | null {
  const s = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
  for (const p of patients) {
    const surname = p.name.split(" ").slice(1).join(" ").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    if (surname.includes(s) || s.includes(surname)) return p
  }
  return null
}

function normalizeStr(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

const SAFE_LLM_INPUTS = new Set([
  "hola",
  "buenas",
  "buenos dias",
  "buenas tardes",
  "buenas noches",
  "ayuda",
  "opciones",
  "comandos",
  "menu",
  "gracias",
  "ok",
  "perfecto",
  "entendido",
])

function isSafeLlmInput(input: string) {
  const normalized = normalizeStr(input).replace(/[¿?¡!.]/g, "").trim()
  return SAFE_LLM_INPUTS.has(normalized)
}

const VALID_VIEWS: ViewType[] = ["welcome", "login", "patients", "patient_detail", "appointment", "report"]

type LlmResponse = {
  type: "show_view" | "respond"
  view: ViewType | null
  data: Record<string, unknown> | null
  message: string
}

type ChatbotProps = {
  onAction: (action: Action) => void
  onLlmStatusChange?: (usingLlm: boolean) => void
}

export default function Chatbot({ onAction, onLlmStatusChange }: ChatbotProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { id: "0", role: "bot", text: "¡Hola! Soy tu asistente médico. ¿En qué puedo ayudarte?" },
  ])
  const [input, setInput] = useState("")
  const [typing, setTyping] = useState(false)
  const [pendingPatients, setPendingPatients] = useState<Patient[] | null>(null)
  const [usingLlm, setUsingLlm] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const updateLlmStatus = useCallback(
    (next: boolean) => {
      setUsingLlm(next)
      onLlmStatusChange?.(next)
    },
    [onLlmStatusChange],
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, typing])

  useEffect(() => {
    if (!typing) inputRef.current?.focus()
  }, [typing])

  const processLlm = useCallback(async (text: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
        }),
      })

      if (!response.ok) return false

      const result: LlmResponse = await response.json()

      const botMsg: Message = { id: crypto.randomUUID(), role: "bot", text: result.message }
      setMessages((prev) => [...prev, botMsg])
      setTyping(false)

      if (result.view && VALID_VIEWS.includes(result.view)) {
        let actionData = result.data ?? undefined
        if (result.view === "patients") {
          actionData = (await resolveActionAsync("pacientes")).data
        } else if (result.view === "patient_detail" && result.data?.patient) {
          const action = await resolveActionAsync(text)
          const matches = action.pendingPatients
          if (matches) {
            setPendingPatients(matches)
            setMessages((prev) => [...prev.slice(0, -1), {
              id: crypto.randomUUID(),
              role: "bot",
              text: getDisambiguationMessage(matches),
            }])
            return true
          }
          actionData = action.view === "patient_detail" ? action.data : undefined
        }
        onAction({ view: result.view, data: actionData })
      } else {
        const cleaned = text.replace(/[^\w\sáéíóúüñ]/gi, "").trim().toLowerCase()
        const isHelpRequest = HELP_LABELS.some((w) => cleaned.includes(w))
        const action = (await resolveActionAsync(text)) as RegistryAction
        if (action.view !== "welcome" && !action.pendingPatients) {
          const botText = isHelpRequest ? formatHelp() : getBotResponse(text, action)
          setMessages((prev) => [...prev.slice(0, -1), {
            id: crypto.randomUUID(), role: "bot",
            text: botText,
          }])
          onAction(action)
        } else if (action.pendingPatients && action.pendingPatients.length > 0) {
          setPendingPatients(action.pendingPatients)
          setMessages((prev) => [...prev.slice(0, -1), {
            id: crypto.randomUUID(), role: "bot",
            text: getDisambiguationMessage(action.pendingPatients!),
          }])
        } else if (isHelpRequest) {
          setMessages((prev) => [...prev.slice(0, -1), {
            id: crypto.randomUUID(), role: "bot",
            text: formatHelp(),
          }])
        } else {
          const lowerMsg = result.message.toLowerCase()
          if (/credenciales|iniciar sesion|logue[ae]r|acceder|usuario|contraseña|login/i.test(lowerMsg)) {
            onAction({ view: "login" })
          } else if (/listado.*pacientes|pacientes.*registrados|todos los pacientes/i.test(lowerMsg)) {
            onAction({ view: "patients" })
          } else if (/turno|cita|agendar/i.test(lowerMsg)) {
            onAction({ view: "appointment" })
          } else if (/reporte|informe/i.test(lowerMsg)) {
            onAction({ view: "report" })
          } else if (/bienvenido|inicio|principal/i.test(lowerMsg)) {
            onAction({ view: "welcome" })
          }
        }
      }

      return true
    } catch {
      return false
    }
  }, [onAction])

  async function sendText(text: string) {
    if (!text) return
    setInput("")
    inputRef.current?.focus()

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", text }
    setMessages((prev) => [...prev, userMsg])
    setTyping(true)

    await new Promise((r) => setTimeout(r, 400))

    if (pendingPatients) {
      if (/\b(?:cancelar|volver|ninguno|ninguna|no)\b/i.test(text)) {
        setPendingPatients(null)
        const botMsg: Message = { id: crypto.randomUUID(), role: "bot", text: "Está bien, me decís si querés otra cosa." }
        setMessages((prev) => [...prev, botMsg])
        setTyping(false)
        return
      }

      const matched = matchSurname(text, pendingPatients)
      if (matched) {
        setPendingPatients(null)
        const botMsg: Message = { id: crypto.randomUUID(), role: "bot", text: `Mostrando la ficha de **${matched.name}**.` }
        setMessages((prev) => [...prev, botMsg])
        setTyping(false)
        onAction({ view: "patient_detail", data: { patient: matched } })
      } else {
        const surnames = pendingPatients.map((p) => p.name.split(" ").slice(1).join(" "))
        const botMsg: Message = {
          id: crypto.randomUUID(), role: "bot",
          text: `No encontré ese apellido. Los disponibles son: ${surnames.join(", ")}`,
        }
        setMessages((prev) => [...prev, botMsg])
        setTyping(false)
      }
      return
    }

    if (usingLlm && isSafeLlmInput(text)) {
      const llmHandled = await processLlm(text)
      if (llmHandled) return
      updateLlmStatus(false)
    }

    const action = await resolveActionAsync(text) as RegistryAction
    if (action.pendingPatients) {
      setPendingPatients(action.pendingPatients)
      const botMsg: Message = {
        id: crypto.randomUUID(), role: "bot",
        text: getDisambiguationMessage(action.pendingPatients),
      }
      setMessages((prev) => [...prev, botMsg])
      setTyping(false)
      return
    }

    const botText = getBotResponse(text, action)
    const botMsg: Message = {
      id: crypto.randomUUID(),
      role: "bot",
      text: botText,
    }
    setMessages((prev) => [...prev, botMsg])
    setTyping(false)
    onAction(action)
  }

  async function handleSend() {
    await sendText(input.trim())
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="flex h-[36rem] w-[24rem] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_24px_60px_-20px_rgba(15,23,42,0.35)]"
        >
          <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-teal-700 to-cyan-700 px-5 py-4 text-white">
            <div>
              <p className="text-sm font-semibold">Asistente clínico</p>
              <p className="text-[11px] text-teal-100">
                {usingLlm ? "Gemini activo" : "Modo offline — IA no disponible"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {usingLlm && (
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium tracking-wide">
                  IA
                </span>
              )}
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-teal-100 hover:bg-white/10 hover:text-white"
                aria-label="Cerrar chat"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-slate-50/80 px-4 py-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                  msg.role === "user"
                    ? "self-end rounded-2xl rounded-br-md bg-teal-700 text-white"
                    : "self-start rounded-2xl rounded-bl-md border border-slate-100 bg-white text-slate-800"
                }`}
              >
                {msg.role === "bot" ? (
                  <span dangerouslySetInnerHTML={{ __html: renderText(msg.text) }} />
                ) : (
                  msg.text
                )}
              </div>
            ))}
            {typing && (
              <div className="flex items-center gap-1.5 self-start rounded-2xl rounded-bl-md border border-slate-100 bg-white px-4 py-3">
                {dots.map((i) => (
                  <motion.span
                    key={i}
                    animate={{ y: [0, -6, 0] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.12, ease: "easeInOut" }}
                    className="inline-block h-2 w-2 rounded-full bg-teal-400"
                  />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-slate-100 bg-white px-4 py-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={typing}
                  onClick={() => sendText(item.text)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800 disabled:opacity-50"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-100">
              <input
                ref={inputRef}
                className="flex-1 bg-transparent py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-50"
                placeholder="Escribí un mensaje..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={typing}
              />
              <button
                onClick={handleSend}
                disabled={typing || !input.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white transition hover:bg-teal-800 disabled:opacity-40"
                aria-label="Enviar"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            {!usingLlm && (
              <p className="mt-2 text-[10px] text-slate-400">
                Modo offline — IA no disponible
              </p>
            )}
          </div>
        </motion.div>
      )}

      {!open && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 shadow-md">
          ¿Puedo ayudarte?
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg shadow-teal-700/30 transition-transform hover:scale-105 hover:bg-teal-800 active:scale-95"
        aria-label={open ? "Cerrar asistente" : "Abrir asistente"}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>
    </div>
  )
}
