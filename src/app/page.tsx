"use client"

import { useState, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import type { ViewType, Action } from "@/types"
import type { RegistryAction } from "@/lib/actionRegistry"
import ViewRenderer from "@/components/views/ViewRenderer"
import Chatbot from "@/components/chatbot/Chatbot"
import FullScreenLoader from "@/components/views/FullScreenLoader"

export default function Home() {
  const [view, setView] = useState<ViewType>("welcome")
  const [viewData, setViewData] = useState<Record<string, unknown> | undefined>()
  const [loading, setLoading] = useState(false)

  const handleAction = useCallback((action: Action) => {
    const registryAction = action as RegistryAction
    if (action.view === "welcome") {
      setView("welcome")
      setViewData(undefined)
      return
    }
    setLoading(true)
    setTimeout(() => {
      setView(action.view)
      setViewData(registryAction.data)
      setLoading(false)
    }, 1200)
  }, [])

  return (
    <>
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
