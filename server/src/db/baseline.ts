import { config } from "../config"
import { logger } from "../logger"
import { pool } from "./pool"
import { baselineMigrations } from "./migration-runner"

async function main() {
  try {
    await baselineMigrations(config.database.migrationsDirectory)
    logger.info("Baseline de migraciones finalizado")
  } catch (error) {
    logger.error("Falló el baseline de migraciones", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      reason: error instanceof Error ? error.message : "Error desconocido",
    })
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

void main()
