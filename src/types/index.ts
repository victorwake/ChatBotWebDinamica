export type Message = {
  id: string
  role: "user" | "bot"
  text: string
}

export type Action = {
  href: "/" | "/login" | "/patients" | "/appointments" | "/consultations"
}
