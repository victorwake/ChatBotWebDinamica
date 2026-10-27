import { Router, type Request, type Response } from "express"
import { pool } from "../db/pool"
import { logger } from "../logger"

const router = Router()

router.get("/live", (_req: Request, res: Response) => {
  res.json({ status: "ok" })
})

router.get("/ready", async (_req: Request, res: Response) => {
  try {
    await pool.execute("SELECT 1")
    res.json({ status: "ready", dependencies: { database: "ok" } })
  } catch (error) {
    const requestId = String(res.locals.requestId ?? "unknown")
    logger.error("La comprobación de disponibilidad no pudo consultar MySQL", {
      requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    })
    res.status(503).json({
      error: {
        code: "DEPENDENCY_UNAVAILABLE",
        message: "El servicio no está listo.",
        requestId,
      },
    })
  }
})

export default router
