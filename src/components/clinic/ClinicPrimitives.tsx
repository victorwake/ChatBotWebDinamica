import type { ReactNode } from "react"

export function ClinicPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p>
      </header>
      {children}
    </div>
  )
}

export function ClinicCard({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{children}</section>
}

export function formatDateTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "Fecha no disponible"
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date)
}

export function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(date)
}

export function appointmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    requested: "Solicitado",
    confirmed: "Confirmado",
    cancelled: "Cancelado",
    completed: "Atendido",
    no_show: "Ausente",
  }
  return labels[status] ?? "Estado desconocido"
}

export function StatusBadge({ status }: { status: string }) {
  const style = status === "confirmed" || status === "completed"
    ? "bg-emerald-50 text-emerald-800"
    : status === "requested"
      ? "bg-amber-50 text-amber-800"
      : "bg-slate-100 text-slate-700"
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${style}`}>
      {appointmentStatusLabel(status)}
    </span>
  )
}
