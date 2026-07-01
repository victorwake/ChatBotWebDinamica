"use client"

import { useState, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import type { ViewType, Action } from "@/types"
import ViewRenderer from "@/components/views/ViewRenderer"
import Chatbot from "@/components/chatbot/Chatbot"
import FullScreenLoader from "@/components/views/FullScreenLoader"

export default function Home() {
  const [view, setView] = useState<ViewType>("welcome")
  const [viewData, setViewData] = useState<Record<string, unknown> | undefined>()
  const [loading, setLoading] = useState(false)
  const [viewHistory, setViewHistory] = useState<string[]>([])

  const handleAction = useCallback((action: Action) => {
    setViewHistory((prev) => [...prev.slice(-4), `${action.view} @ ${new Date().toLocaleTimeString()}`])
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
    <>
      <div className="fixed left-2 top-2 z-50 rounded bg-black/80 px-2 py-1 text-[10px] leading-tight text-white">
        {viewHistory.join(" | ") || "welcome"}
      </div>
      <AnimatePresence mode="wait">
        {loading ? (
          <FullScreenLoader key="loader" />
        ) : (
          <ViewRenderer key={`view-${view}`} view={view} data={viewData} />
        )}
      </AnimatePresence>
      <Chatbot onAction={handleAction} />
    </>
  )
}
