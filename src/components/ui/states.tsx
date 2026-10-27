"use client"

import type { InputHTMLAttributes, ReactNode } from "react"

export function LoadingState({ label = "Cargando..." }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-100 border-t-teal-700" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({
  title = "No se pudo completar la solicitud",
  description,
  onRetry,
}: {
  title?: string
  description: string
  onRetry?: () => void
}) {
  return (
    <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
      <h2 className="text-sm font-semibold text-rose-900">{title}</h2>
      <p className="mt-1 text-sm text-rose-800">{description}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-900 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
        >
          Reintentar
        </button>
      )}
    </section>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </section>
  )
}

export function FormField({
  id,
  label,
  hint,
  error,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
  hint?: string
  error?: string
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        {...inputProps}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus-visible:ring-2 ${
          error
            ? "border-rose-400 focus-visible:ring-rose-200"
            : "border-slate-300 focus-visible:border-teal-600 focus-visible:ring-teal-100"
        } ${inputProps.className ?? ""}`}
      />
      {hint && <p id={hintId} className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={errorId} className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  )
}

export function Notification({
  children,
  kind = "status",
}: {
  children: ReactNode
  kind?: "status" | "error"
}) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      className={`rounded-xl border px-4 py-3 text-sm ${
        kind === "error"
          ? "border-rose-200 bg-rose-50 text-rose-900"
          : "border-teal-200 bg-teal-50 text-teal-900"
      }`}
    >
      {children}
    </div>
  )
}
