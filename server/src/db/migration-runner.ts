import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { PoolConnection, RowDataPacket } from "mysql2/promise"
import { logger } from "../logger"
import { pool } from "./pool"

type MigrationFile = {
  name: string
  checksum: string
  statements: string[]
}

type AppliedMigration = {
  name: string
  checksum: string
  status: "started" | "applied"
}

type AppliedMigrationRow = RowDataPacket & AppliedMigration
type MigrationLockRow = RowDataPacket & { acquired: number | null }
type SchemaObjectRow = RowDataPacket & { tableName: string; objectName: string }

const MIGRATION_LOCK_NAME = "chatbotweb_migrations"
const MIGRATION_FILE_PATTERN = /^\d{3,}_[a-z0-9_-]+\.sql$/
const NON_COLUMN_DEFINITION = /^(?:CONSTRAINT|PRIMARY|UNIQUE|KEY|INDEX|FOREIGN|CHECK|FULLTEXT|SPATIAL)\b/i

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ""
  let quote: "'" | '"' | "`" | undefined
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]
    const next = sql[index + 1]

    if (lineComment) {
      if (character === "\n") {
        lineComment = false
        current += "\n"
      }
      continue
    }

    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false
        index += 1
      }
      continue
    }

    if (quote) {
      current += character
      if (character === "\\" && next) {
        current += next
        index += 1
      } else if (character === quote) {
        if (next === quote) {
          current += next
          index += 1
        } else {
          quote = undefined
        }
      }
      continue
    }

    if (character === "'" || character === '"' || character === "`") {
      quote = character
      current += character
      continue
    }

    if (character === "#" || (character === "-" && next === "-" && /\s/.test(sql[index + 2] ?? " "))) {
      lineComment = true
      if (character === "-") index += 1
      continue
    }

    if (character === "/" && next === "*") {
      blockComment = true
      index += 1
      continue
    }

    if (character === ";") {
      if (current.trim()) statements.push(current.trim())
      current = ""
      continue
    }

    current += character
  }

  if (quote) throw new Error("Migración SQL con literal o identificador sin cerrar")
  if (blockComment) throw new Error("Migración SQL con comentario de bloque sin cerrar")
  if (current.trim()) statements.push(current.trim())

  return statements
}

function splitTopLevelDefinitions(definition: string): string[] {
  const parts: string[] = []
  let current = ""
  let depth = 0
  let quote: "'" | '"' | "`" | undefined

  for (let index = 0; index < definition.length; index += 1) {
    const character = definition[index]
    const next = definition[index + 1]

    if (quote) {
      current += character
      if (character === "\\" && next) {
        current += next
        index += 1
      } else if (character === quote) {
        if (next === quote) {
          current += next
          index += 1
        } else {
          quote = undefined
        }
      }
      continue
    }

    if (character === "'" || character === '"' || character === "`") {
      quote = character
      current += character
    } else if (character === "(") {
      depth += 1
      current += character
    } else if (character === ")") {
      depth -= 1
      current += character
    } else if (character === "," && depth === 0) {
      parts.push(current.trim())
      current = ""
    } else {
      current += character
    }
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

function extractTableDefinition(statement: string): { tableName: string; columns: string[] } | undefined {
  const header = /^\s*CREATE\s+TABLE\s+`?([a-z0-9_]+)`?\s*\(/i.exec(statement)
  if (!header) return undefined

  const openIndex = statement.indexOf("(", header.index)
  let depth = 0
  let quote: "'" | '"' | "`" | undefined
  let closeIndex = -1

  for (let index = openIndex; index < statement.length; index += 1) {
    const character = statement[index]
    const next = statement[index + 1]

    if (quote) {
      if (character === "\\" && next) {
        index += 1
      } else if (character === quote) {
        if (next === quote) index += 1
        else quote = undefined
      }
      continue
    }

    if (character === "'" || character === '"' || character === "`") quote = character
    else if (character === "(") depth += 1
    else if (character === ")") {
      depth -= 1
      if (depth === 0) {
        closeIndex = index
        break
      }
    }
  }

  if (closeIndex < 0) throw new Error(`Definición CREATE TABLE inválida para ${header[1]}`)

  const body = statement.slice(openIndex + 1, closeIndex)
  const columns = splitTopLevelDefinitions(body)
    .filter((part) => !NON_COLUMN_DEFINITION.test(part))
    .map((part) => /^`?([a-z0-9_]+)`?/i.exec(part)?.[1])
    .filter((name): name is string => Boolean(name))

  return { tableName: header[1], columns }
}

function migrationSchemaObjects(migration: MigrationFile) {
  const tables = new Map<string, Set<string>>()
  const indexes = new Map<string, Set<string>>()
  const constraints = new Map<string, Set<string>>()

  for (const statement of migration.statements) {
    const tableDefinition = extractTableDefinition(statement)
    if (tableDefinition) {
      tables.set(tableDefinition.tableName, new Set(tableDefinition.columns))
      for (const match of statement.matchAll(/\bCONSTRAINT\s+`?([a-z0-9_]+)`?\s+FOREIGN\s+KEY/gi)) {
        const names = constraints.get(tableDefinition.tableName) ?? new Set<string>()
        names.add(match[1])
        constraints.set(tableDefinition.tableName, names)
      }
      continue
    }

    const alterTable = /^\s*ALTER\s+TABLE\s+`?([a-z0-9_]+)`?/i.exec(statement)
    if (alterTable) {
      for (const match of statement.matchAll(/\bCONSTRAINT\s+`?([a-z0-9_]+)`?\s+FOREIGN\s+KEY/gi)) {
        const names = constraints.get(alterTable[1]) ?? new Set<string>()
        names.add(match[1])
        constraints.set(alterTable[1], names)
      }
      continue
    }

    const index = /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+`?([a-z0-9_]+)`?\s+ON\s+`?([a-z0-9_]+)`?/i.exec(statement)
    if (index) {
      const names = indexes.get(index[2]) ?? new Set<string>()
      names.add(index[1])
      indexes.set(index[2], names)
      continue
    }

    throw new Error("El baseline solo admite CREATE TABLE, ALTER TABLE y CREATE INDEX")
  }

  if (tables.size === 0) throw new Error("La migración inicial no contiene tablas para validar")
  return { tables, indexes, constraints }
}

async function validateExistingSchema(
  connection: PoolConnection,
  migration: MigrationFile,
): Promise<void> {
  const expected = migrationSchemaObjects(migration)
  const [tableRows] = await connection.execute<SchemaObjectRow[]>(
    `SELECT TABLE_NAME AS tableName, '' AS objectName
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME <> 'schema_migrations'`,
  )
  const actualTables = new Set(tableRows.map((row) => row.tableName))
  const expectedTables = new Set(expected.tables.keys())

  const missingTables = [...expectedTables].filter((name) => !actualTables.has(name))
  const unexpectedTables = [...actualTables].filter((name) => !expectedTables.has(name))
  if (missingTables.length || unexpectedTables.length) {
    throw new Error(
      `El esquema existente no coincide con la migración inicial; faltan tablas: ${missingTables.join(", ") || "ninguna"}; sobran tablas: ${unexpectedTables.join(", ") || "ninguna"}`,
    )
  }

  const [columnRows] = await connection.execute<SchemaObjectRow[]>(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS objectName
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()`,
  )
  const actualColumns = new Map<string, Set<string>>()
  for (const row of columnRows) {
    const columns = actualColumns.get(row.tableName) ?? new Set<string>()
    columns.add(row.objectName)
    actualColumns.set(row.tableName, columns)
  }

  for (const [tableName, expectedColumns] of expected.tables) {
    const actual = actualColumns.get(tableName) ?? new Set<string>()
    const missing = [...expectedColumns].filter((name) => !actual.has(name))
    const unexpected = [...actual].filter((name) => !expectedColumns.has(name))
    if (missing.length || unexpected.length) {
      throw new Error(
        `Las columnas de ${tableName} no coinciden con la migración inicial; faltan: ${missing.join(", ") || "ninguna"}; sobran: ${unexpected.join(", ") || "ninguna"}`,
      )
    }
  }

  const [indexRows] = await connection.execute<SchemaObjectRow[]>(
    `SELECT TABLE_NAME AS tableName, INDEX_NAME AS objectName
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()`,
  )
  const actualIndexes = new Map<string, Set<string>>()
  for (const row of indexRows) {
    const indexes = actualIndexes.get(row.tableName) ?? new Set<string>()
    indexes.add(row.objectName)
    actualIndexes.set(row.tableName, indexes)
  }

  for (const [tableName, expectedIndexes] of expected.indexes) {
    const actual = actualIndexes.get(tableName) ?? new Set<string>()
    const missing = [...expectedIndexes].filter((name) => !actual.has(name))
    if (missing.length) {
      throw new Error(`Faltan índices esperados en ${tableName}: ${missing.join(", ")}`)
    }
  }

  const [constraintRows] = await connection.execute<SchemaObjectRow[]>(
    `SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS objectName
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
  )
  const actualConstraints = new Map<string, Set<string>>()
  for (const row of constraintRows) {
    const constraints = actualConstraints.get(row.tableName) ?? new Set<string>()
    constraints.add(row.objectName)
    actualConstraints.set(row.tableName, constraints)
  }

  for (const [tableName, expectedConstraints] of expected.constraints) {
    const actual = actualConstraints.get(tableName) ?? new Set<string>()
    const missing = [...expectedConstraints].filter((name) => !actual.has(name))
    if (missing.length) {
      throw new Error(`Faltan claves foráneas esperadas en ${tableName}: ${missing.join(", ")}`)
    }
  }
}

async function loadMigrations(directory: string): Promise<MigrationFile[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const names = entries
    .filter((entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"))

  if (names.length === 0) {
    throw new Error(`No se encontraron migraciones SQL versionadas en ${directory}`)
  }

  const migrations: MigrationFile[] = []
  let previousPrefix: string | undefined

  for (const name of names) {
    const prefix = name.slice(0, name.indexOf("_"))
    if (prefix === previousPrefix) {
      throw new Error(`Prefijo de migración duplicado: ${prefix}`)
    }
    previousPrefix = prefix

    const contents = await readFile(path.join(directory, name), "utf8")
    const statements = splitSqlStatements(contents)
    if (statements.length === 0) {
      throw new Error(`La migración ${name} no contiene instrucciones SQL`)
    }

    migrations.push({
      name,
      checksum: createHash("sha256").update(contents).digest("hex"),
      statements,
    })
  }

  return migrations
}

async function ensureMigrationTable(connection: PoolConnection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      status VARCHAR(16) NOT NULL,
      started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      applied_at TIMESTAMP NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
}

async function getAppliedMigrations(connection: PoolConnection): Promise<Map<string, AppliedMigration>> {
  const [rows] = await connection.execute<AppliedMigrationRow[]>(
    "SELECT name, checksum, status FROM schema_migrations",
  )

  return new Map(rows.map((row) => [row.name, row]))
}

export async function runMigrations(directory: string): Promise<void> {
  await executeMigrations(directory, false)
}

export async function baselineMigrations(directory: string): Promise<void> {
  await executeMigrations(directory, true)
}

async function executeMigrations(directory: string, baselineExistingSchema: boolean): Promise<void> {
  const migrations = await loadMigrations(directory)
  if (baselineExistingSchema && migrations.length !== 1) {
    throw new Error("El baseline solo se permite cuando existe exactamente la migración inicial")
  }
  const connection = await pool.getConnection()
  let lockAcquired = false

  try {
    const [lockRows] = await connection.execute<MigrationLockRow[]>(
      "SELECT GET_LOCK(?, 0) AS acquired",
      [MIGRATION_LOCK_NAME],
    )
    if (lockRows[0]?.acquired !== 1) {
      throw new Error("Ya hay otro proceso ejecutando migraciones")
    }
    lockAcquired = true

    await ensureMigrationTable(connection)
    const applied = await getAppliedMigrations(connection)
    const migrationNames = new Set(migrations.map((migration) => migration.name))

    if (baselineExistingSchema && applied.size > 0) {
      throw new Error("No se puede aplicar baseline: schema_migrations ya contiene registros")
    }

    if (baselineExistingSchema) {
      const migration = migrations[0]
      await validateExistingSchema(connection, migration)
      await connection.execute(
        "INSERT INTO schema_migrations (name, checksum, status, applied_at) VALUES (?, ?, 'applied', CURRENT_TIMESTAMP)",
        [migration.name, migration.checksum],
      )
      logger.info("Baseline de esquema existente registrado", { migration: migration.name })
      return
    }

    if (applied.size === 0) {
      const [existingTables] = await connection.execute<SchemaObjectRow[]>(
        `SELECT TABLE_NAME AS tableName, '' AS objectName
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME <> 'schema_migrations'`,
      )
      if (existingTables.length > 0) {
        throw new Error(
          "La base ya contiene tablas sin historial de migraciones. Verificá el esquema y ejecutá npm run migrate:baseline para registrarlo sin recrearlo",
        )
      }
    }

    for (const previous of applied.values()) {
      if (!migrationNames.has(previous.name)) {
        throw new Error(`Falta el archivo de una migración registrada: ${previous.name}`)
      }
    }

    for (const migration of migrations) {
      const previous = applied.get(migration.name)
      if (previous?.status === "applied") {
        if (previous.checksum !== migration.checksum) {
          throw new Error(`Cambió el checksum de la migración aplicada ${migration.name}`)
        }
        continue
      }
      if (previous?.status === "started") {
        throw new Error(
          `La migración ${migration.name} quedó iniciada sin completar; requiere revisión manual`,
        )
      }

      await connection.execute(
        "INSERT INTO schema_migrations (name, checksum, status) VALUES (?, ?, 'started')",
        [migration.name, migration.checksum],
      )
      logger.info("Aplicando migración", { migration: migration.name })

      for (const statement of migration.statements) {
        await connection.query(statement)
      }

      await connection.execute(
        "UPDATE schema_migrations SET status = 'applied', applied_at = CURRENT_TIMESTAMP WHERE name = ?",
        [migration.name],
      )
      logger.info("Migración aplicada", { migration: migration.name })
    }
  } finally {
    if (lockAcquired) {
      try {
        await connection.execute("SELECT RELEASE_LOCK(?)", [MIGRATION_LOCK_NAME])
      } catch (error) {
        logger.error("No se pudo liberar el bloqueo de migraciones", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        })
      }
    }
    connection.release()
  }
}
