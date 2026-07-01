import { Router, Request, Response } from "express"
import { users } from "../data/users"

const router = Router()

router.post("/login", (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!email || !password) {
    res.status(400).json({ error: "Email y contraseña son requeridos" })
    return
  }

  const user = users.find((u) => u.email === email && u.password === password)

  if (!user) {
    res.status(401).json({ error: "Credenciales inválidas" })
    return
  }

  res.json({ id: user.id, name: user.name, email: user.email })
})

export default router
