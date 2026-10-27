import type { Response } from "express"

export function sendHttpError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
): void {
  res.status(statusCode).json({
    error: {
      code,
      message,
      requestId: String(res.locals.requestId ?? "unknown"),
    },
  })
}
