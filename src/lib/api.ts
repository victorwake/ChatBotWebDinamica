export type ApiValidationIssue = {
  field: string
  code: string
}

export class ApiError extends Error {
  readonly name = "ApiError"

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly details?: ApiValidationIssue[],
  ) {
    super(message)
  }
}

export class ApiNetworkError extends Error {
  readonly name = "ApiNetworkError"

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
  }
}

export class ApiProtocolError extends Error {
  readonly name = "ApiProtocolError"
}

type JsonResponseOptions = Omit<RequestInit, "headers"> & {
  headers?: HeadersInit
}

type EmptyResponseOptions = JsonResponseOptions & {
  expectNoContent: true
}

function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:4000/api/v1"
  const withoutTrailingSlash = configured.replace(/\/+$/, "")

  if (withoutTrailingSlash.endsWith("/api/v1")) return withoutTrailingSlash
  if (withoutTrailingSlash.endsWith("/api")) return `${withoutTrailingSlash}/v1`
  return `${withoutTrailingSlash}/api/v1`
}

function buildApiUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new ApiProtocolError("API paths must be relative to the versioned API base.")
  }

  const base = new URL(getApiBaseUrl())
  const url = new URL(`${base.toString().replace(/\/+$/, "")}${path}`)
  const basePath = base.pathname.replace(/\/+$/, "")

  if (url.origin !== base.origin || !url.pathname.startsWith(`${basePath}/`)) {
    throw new ApiProtocolError("API paths must remain inside the configured versioned API base.")
  }

  return url.toString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    throw new ApiProtocolError("The API returned an invalid JSON response.", { cause: error })
  }
}

async function readApiError(response: Response): Promise<ApiError> {
  let payload: unknown

  try {
    payload = await readJson(response)
  } catch (error) {
    if (!(error instanceof ApiProtocolError)) throw error
  }

  const errorBody = isRecord(payload) && isRecord(payload.error) ? payload.error : undefined
  const details = Array.isArray(errorBody?.details)
    ? errorBody.details.filter(
        (issue): issue is ApiValidationIssue =>
          isRecord(issue) && typeof issue.field === "string" && typeof issue.code === "string",
      )
    : undefined

  return new ApiError(
    response.status,
    typeof errorBody?.code === "string" ? errorBody.code : "HTTP_ERROR",
    typeof errorBody?.message === "string" ? errorBody.message : `API request failed with status ${response.status}.`,
    typeof errorBody?.requestId === "string" ? errorBody.requestId : undefined,
    details,
  )
}

async function sendRequest(url: string, init: RequestInit): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(10_000)
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal

  try {
    return await fetch(url, {
      ...init,
      signal,
      credentials: "include",
      cache: "no-store",
    })
  } catch (error) {
    const timedOut = timeoutSignal.aborted && !init.signal?.aborted
    throw new ApiNetworkError(
      timedOut ? "The API request timed out." : "The API could not be reached.",
      { cause: error },
    )
  }
}

export async function getCsrfToken(): Promise<string> {
  const response = await sendRequest(buildApiUrl("/auth/csrf"), {
    method: "GET",
    headers: { Accept: "application/json" },
  })

  if (!response.ok) throw await readApiError(response)

  const payload = await readJson(response)
  if (!isRecord(payload) || typeof payload.csrfToken !== "string" || payload.csrfToken.length < 32) {
    throw new ApiProtocolError("The API returned an invalid CSRF token response.")
  }

  return payload.csrfToken
}

export function apiRequest(path: string, options: EmptyResponseOptions): Promise<void>
export function apiRequest<T>(path: string, options?: JsonResponseOptions): Promise<T>
export async function apiRequest<T>(
  path: string,
  options: JsonResponseOptions = {},
): Promise<T | void> {
  const url = buildApiUrl(path)
  const { headers: suppliedHeaders, expectNoContent, ...requestOptions } = options as EmptyResponseOptions
  const method = (requestOptions.method ?? "GET").toUpperCase()
  const headers = new Headers(suppliedHeaders)
  headers.set("Accept", "application/json")

  if (typeof requestOptions.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    headers.set("X-CSRF-Token", await getCsrfToken())
  }

  const response = await sendRequest(url, {
    ...requestOptions,
    method,
    headers,
  })

  if (!response.ok) throw await readApiError(response)
  if (response.status === 204) {
    if (expectNoContent) return
    throw new ApiProtocolError("The API returned no content where JSON was expected.")
  }

  return (await readJson(response)) as T
}
