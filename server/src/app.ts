import cors from "cors"
import express from "express"
import { config } from "./config"
import { errorHandler } from "./middleware/error-handler"
import { requestContext } from "./middleware/request-context"
import authV1Routes from "./routes/auth-v1"
import appointmentsRoutes from "./routes/appointments"
import authRoutes from "./routes/auth"
import healthRoutes from "./routes/health"
import patientsRoutes from "./routes/patients"
import patientsV1Routes from "./routes/patients-v1"
import referencesV1Routes from "./routes/references-v1"

export const app = express()

app.use(requestContext)
app.use(cors({ origin: config.corsOrigins, credentials: true }))
app.use(express.json({ limit: "1mb" }))

app.use("/api/v1/health", healthRoutes)
app.use("/api/v1/auth", authV1Routes)
app.use("/api/v1/patients", patientsV1Routes)
app.use("/api/v1", referencesV1Routes)

// Existing demonstration endpoints remain unchanged until their migration phases.
app.use("/api/auth", authRoutes)
app.use("/api/patients", patientsRoutes)
app.use("/api/appointments", appointmentsRoutes)

app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "La ruta solicitada no existe.",
      requestId: String(res.locals.requestId ?? "unknown"),
    },
  })
})

app.use(errorHandler)
