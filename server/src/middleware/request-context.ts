import { randomUUID } from "node:crypto"
import type { NextFunction, Request, Response } from "express"
import { logger } from "../logger"

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID()
  const startedAt = process.hrtime.bigint()
  res.locals.requestId = requestId
  res.setHeader("X-Request-Id", requestId)

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    logger.info("HTTP request", {
      requestId,
      method: req.method,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    })
  })

  next()
}
