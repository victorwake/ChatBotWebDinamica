import { config } from "../config"
import { logger } from "../logger"
import { pool } from "./pool"
import { runMigrations } from "./migration-runner"

async function main() {
  try {
    await runMigrations(config.database.migrationsDirectory)
    logger.info("Ejecución de migraciones finalizada")
  } catch (error) {
    logger.error("Falló la ejecución de migraciones", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      reason: error instanceof Error ? error.message : "Error desconocido",
    })
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

void main()
