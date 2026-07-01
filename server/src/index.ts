import express from "express"
import cors from "cors"
import authRoutes from "./routes/auth"
import patientsRoutes from "./routes/patients"
import appointmentsRoutes from "./routes/appointments"

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

app.use("/api/auth", authRoutes)
app.use("/api/patients", patientsRoutes)
app.use("/api/appointments", appointmentsRoutes)

app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`)
})
