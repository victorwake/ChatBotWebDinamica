"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import type { Message, Action, ViewType } from "@/types"
import type { Patient } from "@/data/mockPatients"
import { mockPatients } from "@/data/mockPatients"
import { resolveActionAsync, getBotResponse, getDisambiguationMessage, formatHelp, HELP_LABELS } from "@/lib/actionRegistry"
import type { RegistryAction } from "@/lib/actionRegistry"
import { OllamaIcon } from "./OllamaIcon"

const dots = [0, 1, 2]

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

const VALID_VIEWS: ViewType[] = ["welcome", "login", "patients", "patient_detail", "appointment", "report"]

type OllamaResponse = {
  type: "show_view" | "respond"
  view: ViewType | null
  data: Record<string, unknown> | null
  message: string
}

export default function Chatbot({ onAction }: { onAction: (action: Action) => void }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { id: "0", role: "bot", text: "¡Hola! Soy tu asistente médico. ¿En qué puedo ayudarte?" },
  ])
  const [input, setInput] = useState("")
  const [typing, setTyping] = useState(false)
  const [pendingPatients, setPendingPatients] = useState<Patient[] | null>(null)
  const [usingOllama, setUsingOllama] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, typing])

  useEffect(() => {
    if (!typing) inputRef.current?.focus()
  }, [typing])

  const processOllama = useCallback(async (text: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyRef.current.slice(-10),
        }),
      })

      if (!response.ok) return false

      const result: OllamaResponse = await response.json()
      historyRef.current.push({ role: "user", content: text })
      historyRef.current.push({ role: "assistant", content: result.message })

      const botMsg: Message = { id: crypto.randomUUID(), role: "bot", text: result.message }
      setMessages((prev) => [...prev, botMsg])
      setTyping(false)

      if (result.view && VALID_VIEWS.includes(result.view)) {
        let actionData = result.data ?? undefined
        if (result.view === "patients") {
          actionData = { patients: mockPatients }
        } else if (result.view === "patient_detail" && result.data?.patient) {
          const name = normalizeStr((result.data.patient as { name?: string }).name ?? "")
          const matches = mockPatients.filter((p) =>
            normalizeStr(p.name).includes(name),
          )
          if (matches.length === 1) {
            actionData = { patient: matches[0] }
          } else if (matches.length > 1) {
            const action = (await resolveActionAsync(text)) as RegistryAction
            if (action.view === "patient_detail" && action.data?.patient) {
              actionData = action.data
              onAction({ view: "patient_detail", data: actionData })
              setMessages((prev) => [...prev.slice(0, -1), {
                id: crypto.randomUUID(), role: "bot",
                text: getBotResponse(text, action),
              }])
            } else {
              const normalizedInput = normalizeStr(text)
              const fullMatch = mockPatients.find((p) =>
                normalizedInput.includes(normalizeStr(p.name)),
              )
              if (fullMatch) {
                actionData = { patient: fullMatch }
                onAction({ view: "patient_detail", data: actionData })
                setMessages((prev) => [...prev.slice(0, -1), {
                  id: crypto.randomUUID(), role: "bot",
                  text: `Mostrando los detalles de ${fullMatch.name}.`,
                }])
              } else {
                setPendingPatients(matches)
                setMessages((prev) => [...prev.slice(0, -1), {
                  id: crypto.randomUUID(), role: "bot",
                  text: getDisambiguationMessage(matches),
                }])
              }
            }
            return true
          }
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
            onAction({ view: "patients", data: { patients: mockPatients } })
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

  async function handleSend() {
    const text = input.trim()
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

    if (usingOllama) {
      const ollamaHandled = await processOllama(text)
      if (ollamaHandled) return
      setUsingOllama(false)
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[32rem] w-[22rem] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-800">Asistente</span>
              {usingOllama && (
                <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                  <OllamaIcon className="h-3 w-3" />
                  IA
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "self-end rounded-br-md bg-zinc-800 text-white"
                    : "self-start rounded-bl-md bg-zinc-100 text-zinc-800"
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
              <div className="flex items-center gap-1.5 self-start rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-3">
                {dots.map((i) => (
                  <motion.span
                    key={i}
                    animate={{ y: [0, -6, 0] }}
                    transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.12, ease: "easeInOut" }}
                    className="inline-block h-2 w-2 rounded-full bg-zinc-400"
                  />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-zinc-100 px-4 py-3">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm outline-none focus:border-zinc-400 disabled:opacity-50"
                placeholder="Escribí un mensaje..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={typing}
              />
              <button
                onClick={handleSend}
                disabled={typing}
                className="rounded-xl bg-zinc-800 px-4 text-sm text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
            {!usingOllama && (
              <p className="mt-1 text-[10px] text-zinc-400">
                Modo offline — Ollama no disponible
              </p>
            )}
          </div>
        </div>
      )}

      {!open && (
        <div className="animate-bounce rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-600 shadow-md">
          ¿Puedo ayudarte?
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        {open ? (
          <span className="text-lg">✕</span>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>
    </div>
  )
}
