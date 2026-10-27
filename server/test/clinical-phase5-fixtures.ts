import { once } from "node:events"
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise"
import type { Server } from "node:http"
import { closeServer, createPhase3Fixture, type Phase3Fixture } from "./phase3-fixtures"
import { pool, withTransaction } from "../src/db/pool"

export type Phase5Fixture = Phase3Fixture & {
  server: Server
  baseUrl: string
  appointmentId: number
  createAppointment(patientId?: number): Promise<number>
  close(): Promise<void>
}

export async function createPhase5Fixture(): Promise<Phase5Fixture> {
  const fixture = await createPhase3Fixture()
  const { server: httpServer, baseUrl } = await fixture.startServer()
  const patientId = fixture.patient.patientId
  if (patientId === undefined) throw new Error("Phase 5 fixture requires a patient account")

  const createAppointment = async (targetPatientId = patientId) =>
    withTransaction(async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO turnos
          (paciente_id, medico_id, especialidad_id, datetime_inicio, datetime_fin, estado, motivo_consulta)
         VALUES (?, ?, ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR),
           DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE), 'confirmado', 'Synthetic phase 5 appointment')`,
        [targetPatientId, fixture.doctorId, fixture.specialtyId],
      )
      return result.insertId
    })

  const appointmentId = await createAppointment()

  return {
    ...fixture,
    server: httpServer,
    baseUrl,
    appointmentId,
    createAppointment,
    async close() {
      await closeServer(httpServer)
      await withTransaction(async (connection) => {
        const patientIds = [fixture.patient.patientId, fixture.otherPatient.patientId]
          .filter((id): id is number => id !== undefined)
        const placeholders = patientIds.map(() => "?").join(", ")
        const [consultations] = await connection.execute<Array<RowDataPacket & { id: number }>>(
          `SELECT id FROM consultas_medicas WHERE paciente_id IN (${placeholders}) OR medico_id = ?`,
          [...patientIds, fixture.doctorId],
        )
        const consultationIds = consultations.map((item) => item.id)
        if (consultationIds.length > 0) {
          const consultationPlaceholders = consultationIds.map(() => "?").join(", ")
          const [prescriptions] = await connection.execute<Array<RowDataPacket & { id: number }>>(
            `SELECT id FROM recetas WHERE consulta_id IN (${consultationPlaceholders})`,
            consultationIds,
          )
          if (prescriptions.length > 0) {
            const prescriptionPlaceholders = prescriptions.map(() => "?").join(", ")
            await connection.execute(
              `DELETE FROM receta_items WHERE receta_id IN (${prescriptionPlaceholders})`,
              prescriptions.map((item) => item.id),
            )
            await connection.execute(
              `DELETE FROM recetas WHERE id IN (${prescriptionPlaceholders})`,
              prescriptions.map((item) => item.id),
            )
          }
          await connection.execute(
            `DELETE FROM tratamientos WHERE consulta_id IN (${consultationPlaceholders})`,
            consultationIds,
          )
          await connection.execute(
            `DELETE FROM consultas_patologias WHERE consulta_id IN (${consultationPlaceholders})`,
            consultationIds,
          )
          await connection.execute(
            `DELETE FROM consultas_medicas WHERE id IN (${consultationPlaceholders})`,
            consultationIds,
          )
        }
        await connection.execute(
          `DELETE FROM patologias WHERE paciente_id IN (${placeholders})`,
          patientIds,
        )
      })
      await fixture.cleanup()
    },
  }
}

export async function createConsultation(
  fixture: Phase5Fixture,
  cookie: string,
  csrfToken: string,
  appointmentId = fixture.appointmentId,
): Promise<{ id: string }> {
  const response = await fetch(`${fixture.baseUrl}/api/v1/consultations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ appointmentId: String(appointmentId), type: "programada" }),
  })
  if (!response.ok) throw new Error(`Could not create clinical test consultation: ${response.status}`)
  return response.json() as Promise<{ id: string }>
}
