import assert from "node:assert/strict"
import test from "node:test"
import type { ResultSetHeader } from "mysql2/promise"
import { pool } from "../src/db/pool"
import { createPhase4Fixture } from "./appointments-phase4-fixtures"

test("availability honors pagination, working-hour exceptions and the configured timezone", async () => {
  const fixture = await createPhase4Fixture()

  try {
    const patient = await fixture.login(fixture.patient, fixture.baseUrl)
    const slots = await fixture.slots(patient.cookie)
    assert.equal(slots.length, 6)
    assert.equal(slots[0]?.startsAt, `${fixture.date}T12:00:00.000Z`)

    const paginated = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/availability?from=${encodeURIComponent(fixture.from)}&to=${encodeURIComponent(fixture.to)}&doctorId=${fixture.doctorId}&page=2&pageSize=2`,
      { headers: { Cookie: patient.cookie } },
    )
    assert.equal(paginated.status, 200)
    const page = await paginated.json() as { items: unknown[]; page: number; totalItems: number }
    assert.equal(page.items.length, 2)
    assert.equal(page.page, 2)
    assert.equal(page.totalItems, 6)

    const thirtyTwoDaysLater = new Date(new Date(fixture.from).getTime() + 32 * 24 * 60 * 60 * 1000).toISOString()
    const invalidLongRange = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/availability?from=${encodeURIComponent(fixture.from)}&to=${encodeURIComponent(thirtyTwoDaysLater)}`,
      { headers: { Cookie: patient.cookie } },
    )
    assert.equal(invalidLongRange.status, 422)

    const [block] = await pool.execute<ResultSetHeader>(
      `INSERT INTO excepciones_horarios (medico_id, fecha, tipo, hora_inicio, hora_fin)
       VALUES (?, ?, 'bloqueo', '09:30:00', '10:30:00')`,
      [fixture.doctorId, fixture.date],
    )
    const afterBlock = await fixture.slots(patient.cookie)
    assert.equal(afterBlock.length, 4)
    assert.equal(afterBlock.some((slot) => slot.startsAt === `${fixture.date}T12:30:00.000Z`), false)
    assert.equal(afterBlock.some((slot) => slot.startsAt === `${fixture.date}T13:00:00.000Z`), false)
    await pool.execute("DELETE FROM excepciones_horarios WHERE id = ?", [block.insertId])

    const [holiday] = await pool.execute<ResultSetHeader>(
      "INSERT INTO excepciones_horarios (medico_id, fecha, tipo) VALUES (?, ?, 'feriado')",
      [fixture.doctorId, fixture.date],
    )
    assert.equal((await fixture.slots(patient.cookie)).length, 0)
    await pool.execute("DELETE FROM excepciones_horarios WHERE id = ?", [holiday.insertId])

    const [change] = await pool.execute<ResultSetHeader>(
      `INSERT INTO excepciones_horarios
        (medico_id, fecha, tipo, hora_inicio, hora_fin)
       VALUES (?, ?, 'cambio', '13:00:00', '14:00:00')`,
      [fixture.doctorId, fixture.date],
    )
    const changedSchedule = await fixture.slots(patient.cookie)
    assert.equal(changedSchedule.length, 2)
    assert.deepEqual(
      changedSchedule.map((slot) => slot.startsAt),
      [`${fixture.date}T16:00:00.000Z`, `${fixture.date}T16:30:00.000Z`],
    )
    await pool.execute("DELETE FROM excepciones_horarios WHERE id = ?", [change.insertId])

    const specialtyFilter = await fetch(
      `${fixture.baseUrl}/api/v1/appointments/availability?from=${encodeURIComponent(fixture.from)}&to=${encodeURIComponent(fixture.to)}&specialtyId=${fixture.specialtyId}&page=1&pageSize=100`,
      { headers: { Cookie: patient.cookie } },
    )
    assert.equal(specialtyFilter.status, 200)
    const specialtySlots = await specialtyFilter.json() as { items: Array<{ specialty: { id: string } }> }
    assert.ok(specialtySlots.items.length > 0)
    assert.ok(specialtySlots.items.every((slot) => slot.specialty.id === String(fixture.specialtyId)))
  } finally {
    await fixture.close()
  }
})
