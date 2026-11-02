import { createHash, randomUUID } from "node:crypto"

export class VerificationEmailError extends Error {
  readonly name = "VerificationEmailError"

  constructor(
    message: string,
    readonly providerStatus?: number,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

type RegistrationNotice = {
  email: string
  token?: string
  continueTo?: string
}

function getEmailConfiguration(): { apiKey: string; from: string; appUrl: URL } {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.RESEND_FROM_EMAIL?.trim()
  const appUrlValue = process.env.PUBLIC_APP_URL?.trim()

  if (!apiKey || !from || !appUrlValue) {
    throw new VerificationEmailError("El envío de verificación no está configurado.")
  }

  let appUrl: URL
  try {
    appUrl = new URL(appUrlValue)
  } catch (error) {
    throw new VerificationEmailError("La URL pública de la aplicación no es válida.", undefined, { cause: error })
  }

  if (
    !["http:", "https:"].includes(appUrl.protocol)
    || appUrl.pathname !== "/"
    || appUrl.username
    || appUrl.password
    || appUrl.search
    || appUrl.hash
    || (process.env.NODE_ENV === "production" && appUrl.protocol !== "https:")
  ) {
    throw new VerificationEmailError("La URL pública de la aplicación no es válida.")
  }

  return { apiKey, from, appUrl }
}

export function assertVerificationEmailConfigured(): void {
  getEmailConfiguration()
}

export async function sendRegistrationNotice({ email, token, continueTo }: RegistrationNotice): Promise<void> {
  const { apiKey, from, appUrl } = getEmailConfiguration()
  const verificationUrl = new URL("/verify-email", appUrl)
  if (token) {
    if (continueTo) {
      const continuation = new URL(continueTo, appUrl)
      if (continuation.origin !== appUrl.origin || continuation.pathname !== "/appointments/availability") {
        throw new VerificationEmailError("La ruta para continuar el registro no es válida.")
      }
      verificationUrl.searchParams.set("next", `${continuation.pathname}${continuation.search}`)
    }
    verificationUrl.hash = new URLSearchParams({ token }).toString()
  }

  const subject = token ? "Verificá tu email" : "Solicitud recibida"
  const text = token
    ? `Para verificar tu email y activar tu cuenta de paciente, abrí este enlace: ${verificationUrl.toString()}\n\nSi no solicitaste esta cuenta, ignorá este mensaje.`
    : "Recibimos una solicitud relacionada con esta dirección. Por seguridad, no confirmamos datos de cuentas por email. Si no esperabas este mensaje, podés ignorarlo."
  const html = token
    ? `<p>Para verificar tu email y activar tu cuenta de paciente, <a href="${verificationUrl.toString()}">abrí este enlace</a>.</p><p>Si no solicitaste esta cuenta, ignorá este mensaje.</p>`
    : "<p>Recibimos una solicitud relacionada con esta dirección. Por seguridad, no confirmamos datos de cuentas por email. Si no esperabas este mensaje, podés ignorarlo.</p>"
  const idempotencyKey = token
    ? createHash("sha256").update(token).digest("hex")
    : randomUUID()

  let response: Response
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ from, to: [email], subject, text, html }),
      signal: AbortSignal.timeout(8_000),
    })
  } catch (error) {
    throw new VerificationEmailError("No se pudo contactar al proveedor de email.", undefined, { cause: error })
  }

  if (!response.ok) {
    throw new VerificationEmailError("El proveedor de email rechazó el envío.", response.status)
  }
}

export async function sendPatientInvitationNotice(email: string, token?: string): Promise<void> {
  const { apiKey, from, appUrl } = getEmailConfiguration()
  const invitationUrl = new URL("/accept-invitation", appUrl)
  if (token) invitationUrl.hash = new URLSearchParams({ token }).toString()

  const subject = token ? "Activá tu cuenta de paciente" : "Solicitud recibida"
  const text = token
    ? `Para activar tu cuenta de paciente y elegir una contraseña, abrí este enlace: ${invitationUrl.toString()}\n\nSi no esperabas esta invitación, ignorá este mensaje.`
    : "Recibimos una solicitud relacionada con esta dirección. Por seguridad, no confirmamos datos de cuentas por email. Si no esperabas este mensaje, podés ignorarlo."
  const html = token
    ? `<p>Para activar tu cuenta de paciente y elegir una contraseña, <a href="${invitationUrl.toString()}">abrí este enlace</a>.</p><p>Si no esperabas esta invitación, ignorá este mensaje.</p>`
    : "<p>Recibimos una solicitud relacionada con esta dirección. Por seguridad, no confirmamos datos de cuentas por email. Si no esperabas este mensaje, podés ignorarlo.</p>"
  const idempotencyKey = token
    ? createHash("sha256").update(token).digest("hex")
    : randomUUID()

  let response: Response
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ from, to: [email], subject, text, html }),
      signal: AbortSignal.timeout(8_000),
    })
  } catch (error) {
    throw new VerificationEmailError("No se pudo contactar al proveedor de email.", undefined, { cause: error })
  }

  if (!response.ok) {
    throw new VerificationEmailError("El proveedor de email rechazó el envío.", response.status)
  }
}
