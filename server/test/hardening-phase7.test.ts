import assert from "node:assert/strict"
import { once } from "node:events"
import test from "node:test"
import type { AddressInfo } from "node:net"
import express from "express"
import { parseEnvironmentConfig } from "../src/config"
import { configureHttpServer } from "../src/http-server"
import { createApiRateLimiter } from "../src/middleware/api-rate-limit"
import { createSecurityHeaders } from "../src/middleware/security-headers"
import { app } from "../src/app"
import { closeServer } from "./phase3-fixtures"

const requiredDatabaseConfig = {
  DB_HOST: "127.0.0.1",
  DB_USER: "test_user",
  DB_PASSWORD: "test_password",
  DB_NAME: "test_database",
}

test("production configuration requires HTTPS origins and a database password", () => {
  assert.throws(() => parseEnvironmentConfig({
    ...requiredDatabaseConfig,
    NODE_ENV: "production",
    CORS_ORIGINS: "http://frontend.example.test",
  }), /CORS_ORIGINS/)

  assert.throws(() => parseEnvironmentConfig({
    ...requiredDatabaseConfig,
    NODE_ENV: "production",
    CORS_ORIGINS: "https://frontend.example.test/app",
  }), /CORS_ORIGINS/)

  assert.throws(() => parseEnvironmentConfig({
    ...requiredDatabaseConfig,
    DB_PASSWORD: "",
    NODE_ENV: "production",
    CORS_ORIGINS: "https://frontend.example.test",
  }), /DB_PASSWORD/)

  const production = parseEnvironmentConfig({
    ...requiredDatabaseConfig,
    NODE_ENV: "production",
    CORS_ORIGINS: "https://frontend.example.test",
  })
  assert.deepEqual(production.CORS_ORIGINS, ["https://frontend.example.test"])
  assert.equal(production.TRUST_PROXY_HOPS, 0)
  assert.equal(production.API_RATE_LIMIT_MAX, 300)
})

test("production security headers enable HSTS", async () => {
  const secureApp = express()
  secureApp.use(createSecurityHeaders("production"))
  secureApp.get("/", (_req, res) => res.sendStatus(204))
  const server = secureApp.listen(0)
  await once(server, "listening")
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  try {
    const response = await fetch(baseUrl)
    assert.equal(response.status, 204)
    assert.equal(response.headers.get("strict-transport-security"), "max-age=15552000")
  } finally {
    await closeServer(server)
  }
})

test("API responses include security headers, enforce CORS and reject oversized JSON", async () => {
  const server = app.listen(0)
  await once(server, "listening")
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  try {
    const health = await fetch(`${baseUrl}/api/v1/health/live`, {
      headers: { Origin: "http://localhost:3000" },
    })
    assert.equal(health.status, 200)
    assert.equal(health.headers.get("x-content-type-options"), "nosniff")
    assert.equal(health.headers.get("x-frame-options"), "DENY")
    assert.equal(health.headers.get("referrer-policy"), "no-referrer")
    assert.equal(health.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'")
    assert.equal(health.headers.get("access-control-allow-origin"), "http://localhost:3000")
    assert.equal(health.headers.get("x-powered-by"), null)

    const untrustedOrigin = await fetch(`${baseUrl}/api/v1/health/live`, {
      headers: { Origin: "https://untrusted.example.test" },
    })
    assert.equal(untrustedOrigin.status, 200)
    assert.equal(untrustedOrigin.headers.get("access-control-allow-origin"), null)

    const oversizedBody = JSON.stringify({ value: "x".repeat(1_100_000) })
    const oversized = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: oversizedBody,
    })
    assert.equal(oversized.status, 413)
    assert.equal(
      (await oversized.json() as { error: { code: string } }).error.code,
      "PAYLOAD_TOO_LARGE",
    )
  } finally {
    await closeServer(server)
  }
})

test("API rate limiter returns a stable 429 response and standard headers", async () => {
  const rateLimitedApp = express()
  rateLimitedApp.use(createApiRateLimiter(60_000, 1))
  rateLimitedApp.get("/", (_req, res) => res.json({ status: "ok" }))
  const server = rateLimitedApp.listen(0)
  await once(server, "listening")
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  try {
    const first = await fetch(baseUrl)
    assert.equal(first.status, 200)
    assert.ok(first.headers.has("ratelimit-policy"))

    const blocked = await fetch(baseUrl)
    assert.equal(blocked.status, 429)
    assert.equal(
      (await blocked.json() as { error: { code: string } }).error.code,
      "RATE_LIMITED",
    )
  } finally {
    await closeServer(server)
  }
})

test("HTTP server config applies bounded request and connection timeouts", () => {
  const server = express().listen(0)
  try {
    configureHttpServer(server)
    assert.equal(server.headersTimeout, 10_000)
    assert.equal(server.requestTimeout, 30_000)
    assert.equal(server.keepAliveTimeout, 5_000)
    assert.equal(server.maxRequestsPerSocket, 1_000)
    assert.equal(server.timeout, 30_000)
  } finally {
    server.close()
  }
})
