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
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(900_000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100_000).default(300),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string().min(1),
  DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  DB_MIGRATIONS_DIR: z.string().default("./migrations"),
}).superRefine((values, context) => {
  for (const origin of values.CORS_ORIGINS) {
    if (new URL(origin).origin !== origin) {
      context.addIssue({
        code: "custom",
        path: ["CORS_ORIGINS"],
        message: "Cada origen CORS debe ser un origen exacto sin ruta, query ni fragmento.",
      })
    }
  }
  if (
    values.NODE_ENV === "production"
    && values.CORS_ORIGINS.some((origin) => new URL(origin).protocol !== "https:")
  ) {
    context.addIssue({
      code: "custom",
      path: ["CORS_ORIGINS"],
      message: "En producción todos los orígenes CORS deben usar HTTPS.",
    })
  }
  if (values.NODE_ENV === "production" && values.DB_PASSWORD.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["DB_PASSWORD"],
      message: "La contraseña de base de datos no puede estar vacía en producción.",
    })
  }
})

export function parseEnvironmentConfig(environment: NodeJS.ProcessEnv) {
  const parsedConfig = configSchema.safeParse(environment)
  if (!parsedConfig.success) {
    const issues = parsedConfig.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")
    throw new Error(`Configuración del backend inválida: ${issues}`)
  }
  return parsedConfig.data
}

const parsedConfig = parseEnvironmentConfig(process.env)

export const config = {
  environment: parsedConfig.NODE_ENV,
  port: parsedConfig.PORT,
  corsOrigins: parsedConfig.CORS_ORIGINS,
  trustProxyHops: parsedConfig.TRUST_PROXY_HOPS,
  apiRateLimit: {
    windowMs: parsedConfig.API_RATE_LIMIT_WINDOW_MS,
    max: parsedConfig.API_RATE_LIMIT_MAX,
  },
  database: {
    host: parsedConfig.DB_HOST,
    port: parsedConfig.DB_PORT,
    user: parsedConfig.DB_USER,
    password: parsedConfig.DB_PASSWORD,
    name: parsedConfig.DB_NAME,
    connectionLimit: parsedConfig.DB_CONNECTION_LIMIT,
    migrationsDirectory: path.resolve(process.cwd(), parsedConfig.DB_MIGRATIONS_DIR),
  },
} as const
