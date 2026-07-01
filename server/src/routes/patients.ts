import { Router, Request, Response } from "express"
import { patients } from "../data/patients"

const router = Router()

router.get("/", (_req: Request, res: Response) => {
  const list = patients.map(({ diagnosis, medications, allergies, lastVisit, ...rest }) => rest)
  res.json(list)
})

router.get("/:id", (req: Request, res: Response) => {
  const patient = patients.find((p) => p.id === req.params.id)
  if (!patient) {
    res.status(404).json({ error: "Paciente no encontrado" })
    return
  }
  res.json(patient)
})

export default router
