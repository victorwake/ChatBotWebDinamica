import { app } from "./app"
import { config } from "./config"
import { pool } from "./db/pool"
import { configureHttpServer } from "./http-server"
import { logger } from "./logger"

const server = app.listen(config.port, () => {
  configureHttpServer(server)
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
  const shutdownTimeout = setTimeout(() => {
    logger.error("Se agotó el tiempo de cierre ordenado; se cerrarán las conexiones activas", {
      timeoutMs: 15_000,
    })
    server.closeAllConnections()
    process.exitCode = 1
  }, 15_000)
  shutdownTimeout.unref()

  server.close((error) => {
    clearTimeout(shutdownTimeout)
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
