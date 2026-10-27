"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { ClinicCard, ClinicPage, formatDateTime, StatusBadge } from "@/components/clinic/ClinicPrimitives"
import { EmptyState, ErrorState, FormField, LoadingState } from "@/components/ui/states"
import {
  confirmAppointment,
  getClinicErrorMessage,
  listAppointments,
  type Appointment,
  type AppointmentStatus,
  type Page,
} from "@/lib/clinic"
import { useSession } from "@/contexts/SessionContext"

const statuses: { value: AppointmentStatus | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "requested", label: "Solicitado" },
  { value: "confirmed", label: "Confirmado" },
  { value: "cancelled", label: "Cancelado" },
  { value: "completed", label: "Atendido" },
  { value: "no_show", label: "Ausente" },
]

export default function AppointmentList({ administrativeMode = false }: { administrativeMode?: boolean }) {
  const { user } = useSession()
  const isAdministrative = Boolean(user?.roles.includes("administrative"))
  const [result, setResult] = useState<Page<Appointment> | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [status, setStatus] = useState<AppointmentStatus | "">("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (administrativeMode && !isAdministrative) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setResult(await listAppointments({
        ...dateRange,
        ...(status ? { status } : {}),
        page: pageNumber,
        pageSize: 20,
      }))
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudieron cargar los turnos."))
    } finally {
      setLoading(false)
    }
  }, [administrativeMode, dateRange, isAdministrative, pageNumber, status])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  function applyDateRange() {
    if ((fromDate && !toDate) || (!fromDate && toDate)) {
      setError("Completá ambas fechas para filtrar por período.")
      return
    }
    if (fromDate && toDate && toDate <= fromDate) {
      setError("La fecha final debe ser posterior a la fecha inicial.")
      return
    }
    setError(null)
    setPageNumber(1)
    setDateRange(fromDate && toDate
      ? { from: `${fromDate}T00:00:00-03:00`, to: `${toDate}T00:00:00-03:00` }
      : {})
  }

  async function confirm(appointmentId: string) {
    setBusyId(appointmentId)
    setError(null)
    setNotice(null)
    try {
      await confirmAppointment(appointmentId)
      setNotice("El turno quedó confirmado.")
      await load()
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudo confirmar el turno."))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ClinicPage
      eyebrow={administrativeMode ? "Gestión administrativa" : "Turnos"}
      title={administrativeMode ? "Gestionar turnos" : "Mis turnos"}
      description={administrativeMode
        ? "Revisá solicitudes y confirmá turnos. El servidor aplica los permisos y filtros del perfil."
        : "Consultá el estado de los turnos asociados a tu sesión."}
    >
      {error && <ErrorState description={error} onRetry={() => void load()} />}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
      <ClinicCard>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Estado
              <select value={status} onChange={(event) => { setPageNumber(1); setStatus(event.target.value as AppointmentStatus | "") }} className="min-w-52 rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <FormField id="appointments-from" label="Desde" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            <FormField id="appointments-to" label="Hasta" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            <button type="button" onClick={applyDateRange} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
              Aplicar fechas
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/appointments/availability" className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">
              Buscar disponibilidad
            </Link>
            {!administrativeMode && isAdministrative && (
              <Link href="/appointments/manage" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
                Gestión administrativa
              </Link>
            )}
          </div>
        </div>
        {(!administrativeMode || isAdministrative) && loading && <LoadingState label="Cargando turnos..." />}
        {!loading && result && result.items.length === 0 && (
          <EmptyState title="No hay turnos para mostrar" description="Los turnos disponibles para este perfil aparecerán aquí." />
        )}
        {!loading && result && result.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3 font-medium">Fecha y hora</th>
                  {administrativeMode && <th className="px-3 py-3 font-medium">Paciente</th>}
                  <th className="px-3 py-3 font-medium">Profesional</th>
                  <th className="px-3 py-3 font-medium">Especialidad</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((appointment) => (
                  <tr key={appointment.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3">{formatDateTime(appointment.startsAt)}</td>
                    {administrativeMode && <td className="px-3 py-3">{appointment.patient.displayName}</td>}
                    <td className="px-3 py-3">{appointment.doctor.displayName}</td>
                    <td className="px-3 py-3">{appointment.specialty.name}</td>
                    <td className="px-3 py-3"><StatusBadge status={appointment.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-x-3 gap-y-2">
                        <Link href={`/appointments/${encodeURIComponent(appointment.id)}`} className="font-medium text-teal-800 underline underline-offset-2">Ver</Link>
                        {administrativeMode && appointment.status === "requested" && (
                          <button type="button" disabled={busyId === appointment.id} onClick={() => void confirm(appointment.id)} className="font-medium text-teal-800 underline disabled:opacity-50">
                            {busyId === appointment.id ? "Confirmando..." : "Confirmar"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result && result.totalItems > result.pageSize && (
          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-sm text-slate-600">{result.totalItems} turnos · página {result.page}</span>
            <div className="flex gap-2">
              <button type="button" disabled={pageNumber <= 1 || loading} onClick={() => setPageNumber((current) => current - 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">Anterior</button>
              <button type="button" disabled={pageNumber * result.pageSize >= result.totalItems || loading} onClick={() => setPageNumber((current) => current + 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">Siguiente</button>
            </div>
          </div>
        )}
      </ClinicCard>
      {administrativeMode && !isAdministrative && (
        <ErrorState description="La gestión de turnos está disponible únicamente para el personal administrativo." />
      )}
    </ClinicPage>
  )
}
