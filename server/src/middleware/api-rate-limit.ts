import rateLimit from "express-rate-limit"
import { sendHttpError } from "../auth/http-error"

export function createApiRateLimiter(windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    skip: (request) => request.path.startsWith("/health/"),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      sendHttpError(res, 429, "RATE_LIMITED", "Se alcanzó el límite de solicitudes. Esperá antes de volver a intentar.")
    },
  })
}
