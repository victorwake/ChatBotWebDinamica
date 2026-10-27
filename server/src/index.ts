import { app } from "./app"
import { config } from "./config"
import { pool } from "./db/pool"
import { logger } from "./logger"

const server = app.listen(config.port, () => {
  logger.info("Backend HTTP iniciado", {
    port: config.port,
    environment: config.environment,
  })
})

server.on("error", (error: NodeJS.ErrnoException) => {
  logger.error("No se pudo iniciar el servidor HTTP", {
    errorName: error.name,
    errorCode: error.code,
  })
  process.exitCode = 1
  void pool.end().catch((error: unknown) => {
    logger.error("Falló el cierre del pool MySQL tras un error HTTP", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    })
  })
})

let isShuttingDown = false

function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) return
  isShuttingDown = true
  logger.info("Iniciando cierre ordenado", { signal })

  server.close((error) => {
    if (error) {
      logger.error("Falló el cierre del servidor HTTP", { errorName: error.name })
      process.exitCode = 1
    }

    void pool.end()
      .then(() => logger.info("Pool MySQL cerrado"))
      .catch((poolError: unknown) => {
        logger.error("Falló el cierre del pool MySQL", {
          errorName: poolError instanceof Error ? poolError.name : "UnknownError",
        })
        process.exitCode = 1
      })
  })
}

process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
