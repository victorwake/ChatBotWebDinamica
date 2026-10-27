import type { RequestHandler } from "express"
import { csrfTokenMatches } from "../auth/security"
import { sendHttpError } from "../auth/http-error"

export const requireCsrfToken: RequestHandler = (_req, res, next) => {
  const token = res.locals.sessionToken
  const secret = res.locals.csrfSecret
  const candidate = _req.get("X-CSRF-Token")

  if (!token || !secret || !csrfTokenMatches(secret, token, candidate)) {
    sendHttpError(res, 403, "CSRF_TOKEN_INVALID", "El token CSRF falta o no es válido.")
    return
  }

  next()
}
