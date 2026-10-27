type LogContext = Record<string, string | number | boolean | undefined>

function writeLog(level: "info" | "error", message: string, context: LogContext = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  }

  const serialized = JSON.stringify(entry)
  if (level === "error") {
    console.error(serialized)
    return
  }
  console.log(serialized)
}

export const logger = {
  info: (message: string, context?: LogContext) => writeLog("info", message, context),
  error: (message: string, context?: LogContext) => writeLog("error", message, context),
}
