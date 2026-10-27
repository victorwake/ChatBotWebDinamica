"use client"

import { useState, useCallback, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import type { ViewType, Action } from "@/types"
import ViewRenderer from "@/components/views/ViewRenderer"
import FullScreenLoader from "@/components/views/FullScreenLoader"
import { useChatbotNavigation } from "@/components/chatbot/PersistentChatbot"

export default function Home() {
  const { registerHomeActionHandler } = useChatbotNavigation()
  const [view, setView] = useState<ViewType>("welcome")
  const [viewData, setViewData] = useState<Record<string, unknown> | undefined>()
  const [loading, setLoading] = useState(false)

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

  useEffect(() => registerHomeActionHandler(handleAction), [handleAction, registerHomeActionHandler])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-auto p-6 pb-28">
        <AnimatePresence mode="wait">
          {loading ? (
            <FullScreenLoader key="loader" />
          ) : (
            <ViewRenderer key={`view-${view}`} view={view} data={viewData} onAction={handleAction} />
          )}
        </AnimatePresence>
    </div>
  )
}
