import type { ErrorRequestHandler } from "express"
import { logger } from "../logger"

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const requestId = String(res.locals.requestId ?? "unknown")
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
      ? error.status
      : 500
  const errorResponse = statusCode === 413
    ? { code: "PAYLOAD_TOO_LARGE", message: "El cuerpo de la solicitud supera el tamaño permitido." }
    : statusCode === 408
      ? { code: "REQUEST_TIMEOUT", message: "La solicitud excedió el tiempo permitido." }
      : statusCode === 429
        ? { code: "RATE_LIMITED", message: "Se alcanzó el límite de solicitudes." }
        : statusCode === 500
          ? { code: "INTERNAL_ERROR", message: "Ocurrió un error interno." }
          : { code: "BAD_REQUEST", message: "El request no tiene un formato válido." }

  logger.error("HTTP request failed", {
    requestId,
    statusCode,
    errorName: error instanceof Error ? error.name : "UnknownError",
  })

  res.status(statusCode).json({
    error: {
      ...errorResponse,
      requestId,
    },
  })
}
