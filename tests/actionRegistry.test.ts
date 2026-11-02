import { describe, expect, it } from "vitest"
import { formatHelp, getBotResponse, resolveAction } from "../src/lib/actionRegistry"

describe("chat route actions", () => {
  it.each([
    ["login", "/login"],
    ["mostrame los pacientes", "/patients"],
    ["Vamos a agendar un turno", "/appointments/availability"],
    ["Quiero sacar un turno", "/appointments/availability"],
    ["Necesito pedir una cita", "/appointments/availability"],
    ["quiero ver mis turnos", "/appointments"],
    ["atenciones clínicas", "/consultations"],
    ["ver mi historial", "/consultations"],
    ["volver al inicio", "/"],
  ] as const)("resolves %s to %s", (message, href) => {
    expect(resolveAction(message)).toMatchObject({ href })
  })

  it("does not interpret greetings or unknown requests as screen changes", () => {
    expect(resolveAction("hola")).toBeNull()
    expect(resolveAction("mostrame a una paciente por nombre")).toBeNull()
    expect(getBotResponse("hola")).toContain("Comandos disponibles")
  })

  it("directs appointment booking requests to public availability instead of the login-only list", () => {
    const action = resolveAction("quiero sacar un turno")

    expect(action?.href).toBe("/appointments/availability")
    expect(getBotResponse("quiero sacar un turno", action)).toContain("buscar disponibilidad")
  })

  it("only advertises implemented sections", () => {
    const help = formatHelp()
    expect(help).toContain("atenciones")
    expect(help).not.toContain("reporte")
    expect(help).not.toContain("ficha")
  })
})
