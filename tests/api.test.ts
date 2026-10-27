import { afterEach, describe, expect, it, vi } from "vitest"
import { apiRequest, ApiError, ApiNetworkError } from "../src/lib/api"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("apiRequest", () => {
  it("uses the versioned base URL, cookies, and disables response caching", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api")
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: "ok" }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(apiRequest<{ status: string }>("/health/live")).resolves.toEqual({ status: "ok" })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:4000/api/v1/health/live")
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      credentials: "include",
      cache: "no-store",
      method: "GET",
    }))
  })

  it("surfaces the contract error shape instead of returning success-shaped data", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      error: {
        code: "UNAUTHENTICATED",
        message: "La sesión no está autenticada.",
        requestId: "req_test_001",
      },
    }, { status: 401 })))

    await expect(apiRequest("/patients")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
      requestId: "req_test_001",
    } satisfies Partial<ApiError>)
  })

  it("obtains a fresh CSRF token before sending a state-changing request", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: "c".repeat(32) }))
      .mockResolvedValueOnce(Response.json({ id: "appointment_1" }, { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(apiRequest<{ id: string }>("/appointments", {
      method: "POST",
      body: JSON.stringify({ slotId: "slot_1" }),
    })).resolves.toEqual({ id: "appointment_1" })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:4000/api/v1/auth/csrf")
    expect(fetchMock.mock.calls[1][1].headers).toBeInstanceOf(Headers)
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("X-CSRF-Token")).toBe("c".repeat(32))
    expect(fetchMock.mock.calls[1][1].credentials).toBe("include")
  })

  it("reports network failures explicitly", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")))

    await expect(apiRequest("/health/live")).rejects.toBeInstanceOf(ApiNetworkError)
  })

  it("rejects absolute URLs so callers cannot bypass the configured API origin", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(apiRequest("https://example.test/api/v1/patients")).rejects.toThrow(/relative to the versioned API base/)
    await expect(apiRequest("/../../admin")).rejects.toThrow(/configured versioned API base/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
