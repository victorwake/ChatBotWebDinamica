"use client"

import type { ReactNode } from "react"
import Chatbot from "./Chatbot"

export default function PersistentChatbot({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Chatbot />
    </>
  )
}
