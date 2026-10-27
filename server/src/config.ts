import "dotenv/config"
import path from "node:path"
import { z } from "zod"

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1)),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string().min(1),
  DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  DB_MIGRATIONS_DIR: z.string().default("./migrations"),
})

const parsedConfig = configSchema.safeParse(process.env)

if (!parsedConfig.success) {
  const issues = parsedConfig.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ")
  throw new Error(`Configuración del backend inválida: ${issues}`)
}

export const config = {
  environment: parsedConfig.data.NODE_ENV,
  port: parsedConfig.data.PORT,
  corsOrigins: parsedConfig.data.CORS_ORIGINS,
  database: {
    host: parsedConfig.data.DB_HOST,
    port: parsedConfig.data.DB_PORT,
    user: parsedConfig.data.DB_USER,
    password: parsedConfig.data.DB_PASSWORD,
    name: parsedConfig.data.DB_NAME,
    connectionLimit: parsedConfig.data.DB_CONNECTION_LIMIT,
    migrationsDirectory: path.resolve(process.cwd(), parsedConfig.data.DB_MIGRATIONS_DIR),
  },
} as const
