"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ClinicCard, ClinicPage, formatDateTime } from "@/components/clinic/ClinicPrimitives"
import { EmptyState, ErrorState, FormField, LoadingState } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"
import {
  createAppointment,
  getClinicErrorMessage,
  listAvailability,
  listDoctors,
  listPatients,
  listSpecialties,
  rescheduleAppointment,
  getAppointment,
  type AvailabilitySlot,
  type Doctor,
  type Page,
  type Appointment,
  type PatientSummary,
  type Specialty,
} from "@/lib/clinic"
import { ApiError } from "@/lib/api"

function localDate(daysFromToday = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + daysFromToday)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function toArgentinaInstant(date: string): string {
  return `${date}T00:00:00-03:00`
}

export default function AvailabilitySearch({ rescheduleId }: { rescheduleId?: string }) {
  const router = useRouter()
  const { user } = useSession()
  const isAdministrative = Boolean(user?.roles.includes("administrative"))
  const [from, setFrom] = useState(localDate(1))
  const [to, setTo] = useState(localDate(8))
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [appointmentToReschedule, setAppointmentToReschedule] = useState<Appointment | null>(null)
  const [specialtyId, setSpecialtyId] = useState("")
  const [doctorId, setDoctorId] = useState("")
  const [results, setResults] = useState<Page<AvailabilitySlot> | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [loadingReferences, setLoadingReferences] = useState(true)
  const [loading, setLoading] = useState(false)
  const [savingSlotId, setSavingSlotId] = useState<string | null>(null)
  const [patientSearch, setPatientSearch] = useState("")
  const [patientOptions, setPatientOptions] = useState<PatientSummary[]>([])
  const [patientId, setPatientId] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([listSpecialties(), listDoctors()]).then(([specialtyList, doctorList]) => {
      if (!active) return
      setSpecialties(specialtyList)
      setDoctors(doctorList)
    }).catch((requestError: unknown) => {
      if (active) setError(getClinicErrorMessage(requestError, "No se pudieron cargar las referencias de profesionales."))
    }).finally(() => {
      if (active) setLoadingReferences(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!rescheduleId) return
    let active = true
    void getAppointment(rescheduleId).then((appointment) => {
      if (!active) return
      setAppointmentToReschedule(appointment)
      setSpecialtyId(appointment.specialty.id)
      setDoctorId(appointment.doctor.id)
      return listDoctors(appointment.specialty.id).then((items) => {
        if (active) setDoctors(items)
      })
    }).catch((requestError: unknown) => {
      if (active) setError(getClinicErrorMessage(requestError, "No se pudo cargar el turno para reprogramarlo."))
    })
    return () => { active = false }
  }, [rescheduleId])

  useEffect(() => {
    if (!isAdministrative || patientSearch.trim().length < 2) return
    let active = true
    void listPatients({ search: patientSearch.trim(), page: 1, pageSize: 20 }).then((result) => {
      if (active) setPatientOptions(result.items)
    }).catch((requestError: unknown) => {
      if (active) setError(getClinicErrorMessage(requestError, "No se pudo buscar el paciente."))
    })
    return () => { active = false }
  }, [isAdministrative, patientSearch])

  const search = useCallback(async (nextPage = pageNumber) => {
    if (!from || !to) {
      setError("Elegí las fechas de inicio y fin.")
      return
    }
    const fromDate = new Date(`${from}T00:00:00-03:00`)
    const toDate = new Date(`${to}T00:00:00-03:00`)
    if (toDate <= fromDate) {
      setError("La fecha final debe ser posterior a la fecha inicial.")
      return
    }
    if (toDate.getTime() - fromDate.getTime() > 31 * 24 * 60 * 60 * 1000) {
      setError("El rango de búsqueda no puede superar 31 días.")
      return
    }

    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      setResults(await listAvailability({
        from: toArgentinaInstant(from),
        to: toArgentinaInstant(to),
        ...(specialtyId ? { specialtyId } : {}),
        ...(doctorId ? { doctorId } : {}),
        page: nextPage,
        pageSize: 50,
      }))
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudo consultar la disponibilidad."))
      setResults(null)
    } finally {
      setLoading(false)
    }
  }, [doctorId, from, pageNumber, specialtyId, to])

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPageNumber(1)
    await search(1)
  }

  async function reserve(slot: AvailabilitySlot) {
    if (isAdministrative && !patientId) {
      setError("Buscá y seleccioná el paciente para quien se solicita el turno.")
      return
    }
    if (!isAdministrative && user?.roles.includes("patient") && !user.patientId) {
      setError("La cuenta no tiene un perfil de paciente asociado para solicitar turnos.")
      return
    }

    setSavingSlotId(slot.id)
    setError(null)
    setNotice(null)
    try {
      const request = {
        slotId: slot.id,
        ...(isAdministrative ? { patientId } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }
      const appointment = rescheduleId
        ? await rescheduleAppointment(rescheduleId, { slotId: slot.id, ...(reason.trim() ? { reason: reason.trim() } : {}) })
        : await createAppointment(request)
      router.push(`/appointments/${encodeURIComponent(appointment.id)}`)
    } catch (requestError) {
      const conflict = requestError instanceof ApiError && requestError.status === 409
      setError(conflict ? null : getClinicErrorMessage(
        requestError,
        rescheduleId ? "No se pudo reprogramar el turno." : "No se pudo solicitar el turno.",
      ))
      if (conflict) {
        await search()
        setNotice("La solicitud no se confirmó porque cambió la disponibilidad. Se actualizaron los horarios; elegí otro espacio.")
      }
    } finally {
      setSavingSlotId(null)
    }
  }

  function specialtyChanged(value: string) {
    setSpecialtyId(value)
    setDoctorId("")
    const filtered = value ? doctors.filter((doctor) => doctor.specialty.id === value) : doctors
    setDoctors(filtered)
    if (value) {
      void listDoctors(value).then(setDoctors).catch((requestError: unknown) => {
        setError(getClinicErrorMessage(requestError, "No se pudieron cargar los profesionales."))
      })
    } else {
      void listDoctors().then(setDoctors).catch((requestError: unknown) => {
        setError(getClinicErrorMessage(requestError, "No se pudieron cargar los profesionales."))
      })
    }
  }

  return (
    <ClinicPage
      eyebrow="Turnos"
      title={rescheduleId ? "Reprogramar turno" : "Buscar disponibilidad"}
      description="Los horarios son una consulta al servidor, no una reserva. El espacio queda solicitado únicamente cuando la API confirma la operación."
    >
      {error && <ErrorState description={error} />}
      {notice && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{notice}</p>}
      {appointmentToReschedule && (
        <p className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
          Reprogramando el turno de {appointmentToReschedule.patient.displayName} con {appointmentToReschedule.doctor.displayName}. Solo se muestran opciones de ese profesional.
        </p>
      )}

      <ClinicCard>
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={submitSearch}>
          <FormField id="from" label="Desde" type="date" required value={from} onChange={(event) => setFrom(event.target.value)} />
          <FormField id="to" label="Hasta (exclusiva)" type="date" required value={to} onChange={(event) => setTo(event.target.value)} />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Especialidad
            <select value={specialtyId} disabled={Boolean(rescheduleId)} onChange={(event) => specialtyChanged(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 disabled:bg-slate-100">
              <option value="">Todas</option>
              {specialties.map((specialty) => <option key={specialty.id} value={specialty.id}>{specialty.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Profesional
            <select value={doctorId} disabled={Boolean(rescheduleId)} onChange={(event) => setDoctorId(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 disabled:bg-slate-100">
              <option value="">Cualquiera</option>
              {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.displayName}</option>)}
            </select>
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" disabled={loading || loadingReferences} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {loading ? "Consultando..." : "Buscar horarios"}
            </button>
          </div>
        </form>
      </ClinicCard>

      {isAdministrative && (
        <ClinicCard>
          <h2 className="font-semibold text-slate-900">Paciente</h2>
          <p className="mt-1 text-sm text-slate-600">La reserva administrativa debe asociarse a un paciente.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <FormField id="patient-search" label="Buscar por nombre, apellido o documento" value={patientSearch} onChange={(event) => { setPatientSearch(event.target.value); setPatientId("") }} maxLength={100} />
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Resultado
              <select value={patientId} onChange={(event) => setPatientId(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                <option value="">Seleccioná un paciente</option>
                {patientSearch.trim().length >= 2 && patientOptions.map((patient) => <option key={patient.id} value={patient.id}>{patient.firstName} {patient.lastName} · {patient.id}</option>)}
              </select>
            </label>
          </div>
          {patientSearch.trim().length >= 2 && patientOptions.length === 0 && (
            <p className="mt-2 text-sm text-slate-600">No se encontraron pacientes con esa búsqueda.</p>
          )}
        </ClinicCard>
      )}

      {(user?.roles.includes("patient") || isAdministrative) && (
        <ClinicCard>
          <FormField id="reason" label="Motivo de consulta (opcional)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
        </ClinicCard>
      )}

      {loadingReferences && <LoadingState label="Cargando profesionales y especialidades..." />}
      {loading && <LoadingState label="Consultando horarios al servidor..." />}
      {results && !loading && (
        <ClinicCard>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Horarios disponibles</h2>
            <span className="text-sm text-slate-600">{results.totalItems} horario{results.totalItems === 1 ? "" : "s"}</span>
          </div>
          {results.items.length === 0 ? (
            <EmptyState title="No hay horarios disponibles" description="Probá con otras fechas, especialidad o profesional." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {results.items.map((slot) => (
                <li key={slot.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
                  <div>
                    <p className="font-semibold text-slate-900">{formatDateTime(slot.startsAt)}</p>
                    <p className="mt-1 text-sm text-slate-600">{slot.doctor.displayName} · {slot.specialty.name}</p>
                  </div>
                  <button
                    type="button"
                    disabled={
                      savingSlotId !== null
                      || (!user?.roles.includes("patient") && !isAdministrative)
                      || (Boolean(rescheduleId) && !appointmentToReschedule)
                      || (Boolean(rescheduleId) && !["requested", "confirmed"].includes(appointmentToReschedule?.status ?? ""))
                    }
                    onClick={() => void reserve(slot)}
                    className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {savingSlotId === slot.id ? "Guardando..." : rescheduleId ? "Reprogramar" : "Solicitar"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {results.totalItems > results.pageSize && (
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-sm text-slate-600">Página {results.page}</span>
              <div className="flex gap-2">
                <button type="button" disabled={pageNumber <= 1 || loading} onClick={() => { const nextPage = pageNumber - 1; setPageNumber(nextPage); void search(nextPage) }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">Anterior</button>
                <button type="button" disabled={pageNumber * results.pageSize >= results.totalItems || loading} onClick={() => { const nextPage = pageNumber + 1; setPageNumber(nextPage); void search(nextPage) }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">Siguiente</button>
              </div>
            </div>
          )}
        </ClinicCard>
      )}
      {!user?.roles.includes("patient") && !isAdministrative && (
        <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Este perfil puede consultar horarios, pero el contrato no habilita solicitar turnos con este rol.
        </p>
      )}
      <Link href={rescheduleId ? `/appointments/${encodeURIComponent(rescheduleId)}` : "/appointments"} className="w-fit text-sm font-medium text-teal-800 underline underline-offset-2">
        {rescheduleId ? "Volver al turno" : "Ver mis turnos"}
      </Link>
    </ClinicPage>
  )
}
