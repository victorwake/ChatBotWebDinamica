import mysql, { type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise"
import { config } from "../config"

export const pool = mysql.createPool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  connectionLimit: config.database.connectionLimit,
  waitForConnections: true,
  queueLimit: 50,
  connectTimeout: 10_000,
  charset: "utf8mb4",
  timezone: "Z",
  multipleStatements: false,
})

export type SqlValue = string | number | boolean | Date | null

export async function executeRows<Row extends RowDataPacket>(
  sql: string,
  values: SqlValue[] = [],
): Promise<Row[]> {
  const [rows] = await pool.execute<Row[]>(sql, values)
  return rows
}

export async function executeStatement(
  sql: string,
  values: SqlValue[] = [],
): Promise<ResultSetHeader> {
  const [result] = await pool.execute<ResultSetHeader>(sql, values)
  return result
}

export async function withTransaction<T>(
  operation: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()
    try {
      const result = await operation(connection)
      await connection.commit()
      return result
    } catch (error) {
      try {
        await connection.rollback()
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Falló la operación transaccional y también su rollback",
        )
      }
      throw error
    }
  } finally {
    connection.release()
  }
}
