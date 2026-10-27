"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ClinicCard, ClinicPage, formatDateTime, StatusBadge } from "@/components/clinic/ClinicPrimitives"
import { ErrorState, FormField, LoadingState } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"
import {
  cancelAppointment,
  confirmAppointment,
  getAppointment,
  getClinicErrorMessage,
  type Appointment,
} from "@/lib/clinic"

export default function AppointmentDetail({ appointmentId }: { appointmentId: string }) {
  const { user } = useSession()
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const canCancel = Boolean(
    appointment
    && ["requested", "confirmed"].includes(appointment.status)
    && (
      (user?.roles.includes("patient") && user.patientId === appointment.patient.id)
      || user?.roles.includes("administrative")
    ),
  )
  const canConfirm = appointment?.status === "requested" && user?.roles.includes("administrative")
  const canReschedule = Boolean(
    appointment
    && ["requested", "confirmed"].includes(appointment.status)
    && (
      (user?.roles.includes("patient") && user.patientId === appointment.patient.id)
      || user?.roles.includes("administrative")
    ),
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setAppointment(await getAppointment(appointmentId))
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudo cargar el turno."))
    } finally {
      setLoading(false)
    }
  }, [appointmentId])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  async function mutate(operation: () => Promise<Appointment>, successMessage: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setAppointment(await operation())
      setNotice(successMessage)
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudo actualizar el turno."))
    } finally {
      setBusy(false)
    }
  }

  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const reason = String(formData.get("reason") ?? "").trim()
    await mutate(
      () => cancelAppointment(appointmentId, reason || undefined),
      "El turno se canceló correctamente.",
    )
  }

  return (
    <ClinicPage
      eyebrow="Turnos"
      title="Detalle del turno"
      description="El estado y los datos del turno se obtienen del servidor y dependen de los permisos de tu sesión."
    >
      {loading && <LoadingState label="Cargando turno..." />}
      {error && <ErrorState description={error} onRetry={() => void load()} />}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
      {!loading && appointment && (
        <ClinicCard>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{formatDateTime(appointment.startsAt)}</h2>
              <p className="mt-1 text-sm text-slate-600">Hasta {formatDateTime(appointment.endsAt)}</p>
            </div>
            <StatusBadge status={appointment.status} />
          </div>
          <dl className="grid gap-5 py-5 sm:grid-cols-2">
            <Detail label="Paciente" value={appointment.patient.displayName} />
            <Detail label="Profesional" value={appointment.doctor.displayName} />
            <Detail label="Especialidad" value={appointment.specialty.name} />
            <Detail label="Motivo informado" value={appointment.reason || "No informado"} />
          </dl>
          {error && <div className="mb-4"><ErrorState description={error} /></div>}
          <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
            {canConfirm && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void mutate(
                  () => confirmAppointment(appointmentId),
                  "El turno quedó confirmado.",
                )}
                className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Actualizando..." : "Confirmar turno"}
              </button>
            )}
            {canCancel && (
              <form className="flex w-full flex-wrap items-end gap-3" onSubmit={cancel}>
                <div className="min-w-60 flex-1">
                  <FormField id="cancel-reason" name="reason" label="Motivo de cancelación (opcional)" maxLength={500} disabled={busy} />
                </div>
                <button type="submit" disabled={busy} className="rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-800 disabled:opacity-50">
                  {busy ? "Cancelando..." : "Cancelar turno"}
                </button>
              </form>
            )}
            {canReschedule && (
              <Link
                href={`/appointments/availability?reschedule=${encodeURIComponent(appointment.id)}`}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Reprogramar
              </Link>
            )}
            <Link href="/appointments" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
              Volver a turnos
            </Link>
          </div>
        </ClinicCard>
      )}
    </ClinicPage>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value}</dd>
    </div>
  )
}
