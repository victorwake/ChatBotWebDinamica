import { z } from "zod"
import { hashPassword } from "../auth/password"
import { pool, withTransaction } from "./pool"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"

const bootstrapConfirmation = "CREATE_FIRST_ADMINISTRATOR"

const bootstrapSchema = z.object({
  BOOTSTRAP_ADMIN_CONFIRM: z.literal(bootstrapConfirmation),
  BOOTSTRAP_ADMIN_FIRST_NAME: z.string().trim().min(1).max(100),
  BOOTSTRAP_ADMIN_LAST_NAME: z.string().trim().min(1).max(100),
  BOOTSTRAP_ADMIN_NATIONAL_ID: z.string().trim().min(5).max(20).regex(/^[0-9 .-]+$/),
  BOOTSTRAP_ADMIN_EMAIL: z.string().trim().email().max(254),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(256),
})

async function main() {
  const parsed = bootstrapSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error("Faltan datos válidos para crear el primer administrador o falta la confirmación explícita.")
  }
  const input = parsed.data
  const nationalId = input.BOOTSTRAP_ADMIN_NATIONAL_ID.replace(/\D/g, "")
  const email = input.BOOTSTRAP_ADMIN_EMAIL.toLowerCase()
  if (nationalId.length < 5 || nationalId.length > 20) {
    throw new Error("El DNI debe contener entre 5 y 20 dígitos.")
  }

  const adminUserId = await withTransaction(async (connection) => {
    const [existingAdministrators] = await connection.execute<Array<RowDataPacket & { count: number }>>(
      `SELECT COUNT(*) AS count
       FROM usuarios_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE r.nombre IN ('administrador', 'administrator')`,
    )
    if (Number(existingAdministrators[0]?.count ?? 0) > 0) {
      throw new Error("Ya existe una cuenta con rol administrador; el bootstrap inicial fue bloqueado.")
    }

    const [existingIdentity] = await connection.execute<Array<RowDataPacket & { id: number }>>(
      `SELECT id
       FROM personas
       WHERE REGEXP_REPLACE(dni, '[^0-9]', '') = ?
       FOR UPDATE`,
      [nationalId],
    )
    const [existingEmail] = await connection.execute<Array<RowDataPacket & { id: number }>>(
      "SELECT id FROM users WHERE LOWER(TRIM(email)) = ? FOR UPDATE",
      [email],
    )
    if (existingIdentity.length > 0 || existingEmail.length > 0) {
      throw new Error("La identidad o el email ya están asociados a una cuenta; no se modificaron registros.")
    }

    const [roles] = await connection.execute<Array<RowDataPacket & { id: number }>>(
      "SELECT id FROM roles WHERE nombre = 'administrador' LIMIT 1",
    )
    if (!roles[0]) throw new Error("No está configurado el rol administrador.")

    const [person] = await connection.execute<ResultSetHeader>(
      `INSERT INTO personas (nombre, apellido, dni, email_contacto, activo)
       VALUES (?, ?, ?, ?, TRUE)`,
      [input.BOOTSTRAP_ADMIN_FIRST_NAME, input.BOOTSTRAP_ADMIN_LAST_NAME, nationalId, email],
    )
    const [user] = await connection.execute<ResultSetHeader>(
      `INSERT INTO users (persona_id, email, password_hash, is_active, email_verified)
       VALUES (?, ?, ?, TRUE, TRUE)`,
      [person.insertId, email, await hashPassword(input.BOOTSTRAP_ADMIN_PASSWORD)],
    )
    await connection.execute(
      `INSERT INTO usuarios_roles (user_id, role_id, assigned_by)
       VALUES (?, ?, ?)`,
      [user.insertId, roles[0].id, user.insertId],
    )
    await connection.execute(
      `INSERT INTO auditoria
        (usuario_id, accion, tabla_afectada, registro_id, datos_nuevos)
       VALUES (?, 'administrator.bootstrap.created', 'users', ?, ?)`,
      [user.insertId, user.insertId, JSON.stringify({ role: "administrator" })],
    )
    return user.insertId
  })

  console.log(JSON.stringify({
    message: "Se creó el primer administrador.",
    userId: String(adminUserId),
  }))
}

void main()
  .catch((error: unknown) => {
    const databaseError = typeof error === "object" && error !== null && "code" in error
    console.error(JSON.stringify({
      message: "No se pudo completar el bootstrap del primer administrador.",
      error: databaseError
        ? "La base de datos rechazó la operación."
        : error instanceof Error ? error.message : "Error desconocido",
    }))
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
