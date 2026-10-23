export type Message = {
  id: string
  role: "user" | "bot"
  text: string
}

export type ViewType = "welcome" | "login" | "patients" | "patient_detail" | "appointment" | "report"

export type Action = {
  view: ViewType
  data?: Record<string, unknown>
}

export type ViewProps = {
  data?: Record<string, unknown>
  onAction?: (action: Action) => void
}
