import type { RequestHandler } from "express"
import { config } from "../config"

export function createSecurityHeaders(environment: string): RequestHandler {
  return (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader("Referrer-Policy", "no-referrer")
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    if (environment === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=15552000")
    }
    next()
  }
}

export const securityHeaders = createSecurityHeaders(config.environment)
