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

  logger.error("HTTP request failed", {
    requestId,
    statusCode,
    errorName: error instanceof Error ? error.name : "UnknownError",
  })

  res.status(statusCode).json({
    error: {
      code: statusCode === 500 ? "INTERNAL_ERROR" : "BAD_REQUEST",
      message: statusCode === 500 ? "Ocurrió un error interno." : "El request no tiene un formato válido.",
      requestId,
    },
  })
}
