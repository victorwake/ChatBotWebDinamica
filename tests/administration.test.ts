import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "../src/lib/api"
import {
  getAccount,
  getAdministrationErrorMessage,
  listAccounts,
  listAuditLogs,
  updateAccount,
} from "../src/lib/administration"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("administration API contract", () => {
  it("lists accounts with role, boolean status, search, and pagination filters", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const account = {
      id: "19",
      displayName: "Ada Ejemplo",
      email: "ada@example.test",
      active: false,
      roles: ["doctor", "patient"],
    }
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      items: [account],
      page: 2,
      pageSize: 20,
      totalItems: 21,
    }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listAccounts({
      search: "Ada Ejemplo",
      role: "doctor",
      active: false,
      page: 2,
      pageSize: 20,
    })).resolves.toMatchObject({
      items: [account],
      page: 2,
      totalItems: 21,
    })
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:4000/api/v1/users?search=Ada+Ejemplo&role=doctor&active=false&page=2&pageSize=20",
    )
    expect(fetchMock.mock.calls[0][1].cache).toBe("no-store")
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include")
  })

  it("loads an account and updates its roles and status with CSRF", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const updatedAccount = {
      id: "7",
      displayName: "Bea Ejemplo",
      email: "bea@example.test",
      active: false,
      roles: ["administrative"],
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(updatedAccount))
      .mockResolvedValueOnce(Response.json({ csrfToken: "c".repeat(32) }))
      .mockResolvedValueOnce(Response.json(updatedAccount))
    vi.stubGlobal("fetch", fetchMock)

    await expect(getAccount("7")).resolves.toEqual(updatedAccount)
    await expect(updateAccount("7", {
      active: false,
      roles: ["administrative"],
    })).resolves.toEqual(updatedAccount)

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:4000/api/v1/users/7")
    expect(fetchMock.mock.calls[2][0]).toBe("http://localhost:4000/api/v1/users/7")
    expect(fetchMock.mock.calls[2][1].method).toBe("PATCH")
    expect(fetchMock.mock.calls[2][1].headers.get("X-CSRF-Token")).toBe("c".repeat(32))
    expect(fetchMock.mock.calls[2][1].body).toBe(JSON.stringify({
      active: false,
      roles: ["administrative"],
    }))
  })

  it("lists audit records using only documented metadata filters", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const event = {
      id: "88",
      actorId: "2",
      action: "account.updated",
      resourceType: "user",
      resourceId: "19",
      occurredAt: "2026-10-27T18:00:00.000Z",
    }
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      items: [event],
      page: 1,
      pageSize: 20,
      totalItems: 1,
    }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listAuditLogs({
      actorId: "2",
      action: "account.updated",
      resourceId: "19",
      from: "2026-10-01",
      to: "2026-10-31",
      page: 1,
      pageSize: 20,
    })).resolves.toMatchObject({ items: [event], totalItems: 1 })

    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:4000/api/v1/audit-logs?actorId=2&action=account.updated&resourceId=19&from=2026-10-01&to=2026-10-31&page=1&pageSize=20",
    )
  })

  it("rejects malformed or potentially sensitive audit payloads", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api/v1")
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      items: [{
        id: "88",
        actorId: "2",
        action: "account.updated",
        resourceType: "user",
        occurredAt: "2026-10-27T18:00:00.000Z",
        snapshot: "must not be accepted",
      }],
      page: 1,
      pageSize: 20,
      totalItems: 1,
    }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listAuditLogs()).rejects.toThrow(/invalid paginated response/i)
  })

  it("maps critical account-management conflicts to explicit messages", () => {
    expect(getAdministrationErrorMessage(
      new ApiError(409, "LAST_ACTIVE_ADMINISTRATOR", "server message"),
      "fallback",
    )).toMatch(/sin una cuenta administradora activa/i)
    expect(getAdministrationErrorMessage(
      new ApiError(403, "FORBIDDEN", "server message"),
      "fallback",
    )).toMatch(/administrador del sistema/i)
  })
})
