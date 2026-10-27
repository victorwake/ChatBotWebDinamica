import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../src/lib/api"
import {
  getSignInErrorMessage,
  getCurrentUser,
  getRoleLabel,
  safeInternalPath,
  signIn,
  signOut,
} from "../src/lib/session"

const user = {
  id: "usr_42",
  displayName: "Alex Ejemplo",
  email: "alex@example.test",
  roles: ["patient"],
  patientId: "pat_17",
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("session API", () => {
  it("loads the current user through the cookie-authenticated /me contract", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const fetchMock = vi.fn().mockResolvedValue(Response.json(user))
    vi.stubGlobal("fetch", fetchMock)

    await expect(getCurrentUser()).resolves.toEqual(user)
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/auth/me",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    )
  })

  it("rejects malformed or unknown roles from the session response", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...user, roles: ["root"] })))

    await expect(getCurrentUser()).rejects.toThrow(/invalid user profile/)
  })

  it("requests CSRF before login and sends only the credential payload", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const csrfToken = "c".repeat(32)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken }))
      .mockResolvedValueOnce(Response.json(user))
    vi.stubGlobal("fetch", fetchMock)

    await expect(signIn("alex@example.test", "synthetic-password")).resolves.toEqual(user)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:4000/api/v1/auth/csrf")
    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:4000/api/v1/auth/login")
    expect(fetchMock.mock.calls[1][1].headers.get("X-CSRF-Token")).toBe(csrfToken)
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({
      email: "alex@example.test",
      password: "synthetic-password",
    }))
    expect(fetchMock.mock.calls[1][1].credentials).toBe("include")
  })

  it("obtains CSRF before logout and accepts the contract's empty 204 response", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "c".repeat(32) }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(signOut()).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:4000/api/v1/auth/logout")
    expect(fetchMock.mock.calls[1][1].headers.get("X-CSRF-Token")).toBe("c".repeat(32))
    expect(fetchMock.mock.calls[1][1].credentials).toBe("include")
  })
})

describe("session presentation helpers", () => {
  it("does not allow external or malformed return URLs", () => {
    expect(safeInternalPath("/patients?search=Alex")).toBe("/patients?search=Alex")
    expect(safeInternalPath("//example.test")).toBe("/dashboard")
    expect(safeInternalPath("/\\example.test")).toBe("/dashboard")
  })

  it("uses readable labels for every contract role", () => {
    expect(getRoleLabel("patient")).toBe("Paciente")
    expect(getRoleLabel("doctor")).toBe("Profesional")
    expect(getRoleLabel("administrative")).toBe("Administración")
    expect(getRoleLabel("administrator")).toBe("Administrador del sistema")
  })

  it("shows a neutral credential error and a dedicated rate-limit message", () => {
    expect(getSignInErrorMessage(new Error("secret internal detail"))).toBe(
      "No se pudo iniciar sesión. Revisá la conexión e intentá nuevamente.",
    )
    expect(getSignInErrorMessage(new ApiError(401, "INVALID_CREDENTIALS", "invalid"))).toBe(
      "El email o la contraseña no son válidos.",
    )
    expect(getSignInErrorMessage(new ApiError(429, "RATE_LIMITED", "try later"))).toContain(
      "límite de intentos",
    )
  })
})
