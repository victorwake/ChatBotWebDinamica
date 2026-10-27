"use client"

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import type { Action } from "@/types"
import Chatbot from "./Chatbot"

type HomeActionHandler = (action: Action) => void

type ChatbotNavigationValue = {
  registerHomeActionHandler: (handler: HomeActionHandler) => () => void
  dispatchAction: (action: Action) => void
}

const ChatbotNavigationContext = createContext<ChatbotNavigationValue | null>(null)

export default function PersistentChatbot({
  children,
}: {
  children: ReactNode
}) {
  const router = useRouter()
  const homeActionHandler = useRef<HomeActionHandler | null>(null)
  const pendingAction = useRef<Action | null>(null)

  const registerHomeActionHandler = useCallback((handler: HomeActionHandler) => {
    homeActionHandler.current = handler
    queueMicrotask(() => {
      if (homeActionHandler.current !== handler || !pendingAction.current) return
      const action = pendingAction.current
      pendingAction.current = null
      handler(action)
    })
    return () => {
      if (homeActionHandler.current === handler) homeActionHandler.current = null
    }
  }, [])

  const dispatchAction = useCallback((action: Action) => {
    if (homeActionHandler.current) {
      homeActionHandler.current(action)
      return
    }

    pendingAction.current = action
    router.push("/")
  }, [router])

  return (
    <ChatbotNavigationContext.Provider
      value={{ registerHomeActionHandler, dispatchAction }}
    >
      {children}
      <Chatbot onAction={dispatchAction} />
    </ChatbotNavigationContext.Provider>
  )
}

export function useChatbotNavigation(): ChatbotNavigationValue {
  const context = useContext(ChatbotNavigationContext)
  if (!context) {
    throw new Error("useChatbotNavigation must be used inside PersistentChatbot.")
  }
  return context
}
