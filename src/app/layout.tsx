import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { SessionProvider } from "@/contexts/SessionContext"
import PersistentChatbot from "@/components/chatbot/PersistentChatbot"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Consultorio — ChatBotWebDinamica",
  description: "Sistema médico con navegación por chat",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <SessionProvider>
          <PersistentChatbot>{children}</PersistentChatbot>
        </SessionProvider>
      </body>
    </html>
  )
}
