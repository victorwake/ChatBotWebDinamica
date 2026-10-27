import type { ReactNode } from "react"
import ApplicationShell from "@/components/layout/ApplicationShell"

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <ApplicationShell>{children}</ApplicationShell>
}
