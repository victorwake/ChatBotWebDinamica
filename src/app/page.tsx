"use client"

import { useState, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import type { ViewType, Action } from "@/types"
import ViewRenderer from "@/components/views/ViewRenderer"
import Chatbot from "@/components/chatbot/Chatbot"
import FullScreenLoader from "@/components/views/FullScreenLoader"

const VIEW_LABELS: Record<ViewType, string> = {
  welcome: "Inicio",
  login: "Acceso",
  patients: "Pacientes",
  patient_detail: "Ficha clínica",
  appointment: "Turnos",
  report: "Informe",
}

export default function Home() {
  const [view, setView] = useState<ViewType>("welcome")
  const [viewData, setViewData] = useState<Record<string, unknown> | undefined>()
  const [loading, setLoading] = useState(false)
  const [usingLlm, setUsingLlm] = useState(true)

  const handleAction = useCallback((action: Action) => {
    if (action.view === "welcome") {
      setView("welcome")
      setViewData(undefined)
      return
    }
    setLoading(true)
    setTimeout(() => {
      setView(action.view)
      setViewData(action.data ?? undefined)
      setLoading(false)
    }, 400)
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/90 px-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M12 4v16M4 12h16" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Consultorio</p>
            <p className="text-[11px] text-slate-500">{VIEW_LABELS[view]}</p>
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
            usingLlm
              ? "bg-teal-50 text-teal-800"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {usingLlm ? "IA activa" : "Modo offline"}
        </span>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-auto p-6 pb-28">
        <AnimatePresence mode="wait">
          {loading ? (
            <FullScreenLoader key="loader" />
          ) : (
            <ViewRenderer key={`view-${view}`} view={view} data={viewData} onAction={handleAction} />
          )}
        </AnimatePresence>
      </div>

      <Chatbot onAction={handleAction} onLlmStatusChange={setUsingLlm} />
    </div>
  )
}
