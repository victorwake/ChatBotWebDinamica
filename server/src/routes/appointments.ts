import { Router, Request, Response } from "express"

type Appointment = {
  id: string
  patientId: string
  date: string
  time: string
  reason: string
}

let appointments: Appointment[] = [
  { id: "1", patientId: "1", date: "2026-07-05", time: "10:00", reason: "Control de presión" },
  { id: "2", patientId: "2", date: "2026-07-06", time: "14:30", reason: "Chequeo diabetes" },
]

const router = Router()

router.get("/", (_req: Request, res: Response) => {
  res.json(appointments)
})

router.post("/", (req: Request, res: Response) => {
  const { patientId, date, time, reason } = req.body

  if (!patientId || !date || !time) {
    res.status(400).json({ error: "Faltan campos requeridos: patientId, date, time" })
    return
  }

  const appointment: Appointment = {
    id: String(Date.now()),
    patientId,
    date,
    time,
    reason: reason || "",
  }

  appointments.push(appointment)
  res.status(201).json(appointment)
})

export default router
