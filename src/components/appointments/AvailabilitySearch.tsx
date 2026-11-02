"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ClinicCard, ClinicPage } from "@/components/clinic/ClinicPrimitives"
import { EmptyState, ErrorState, FormField, LoadingState } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"
import {
  argentinaDateKey,
  formatAvailabilityDay,
  formatAvailabilityTime,
  groupAvailabilityByArgentinaDay,
} from "@/lib/availability"
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

type InitialAvailabilitySearch = {
  from?: string
  to?: string
  doctorId?: string
  specialtyId?: string
  page?: number
  slotId?: string
}

function localDate(daysFromToday = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + daysFromToday)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function toArgentinaInstant(date: string): string {
  return `${date}T00:00:00-03:00`
}

export default function AvailabilitySearch({
  rescheduleId,
  initialSearch = {},
}: {
  rescheduleId?: string
  initialSearch?: InitialAvailabilitySearch
}) {
  const router = useRouter()
  const { user, status } = useSession()
  const isAdministrative = Boolean(user?.roles.includes("administrative"))
  const [from, setFrom] = useState(initialSearch.from ?? localDate(1))
  const [to, setTo] = useState(initialSearch.to ?? localDate(8))
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [appointmentToReschedule, setAppointmentToReschedule] = useState<Appointment | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [specialtyId, setSpecialtyId] = useState(initialSearch.specialtyId ?? "")
  const [doctorId, setDoctorId] = useState(initialSearch.doctorId ?? "")
  const [results, setResults] = useState<Page<AvailabilitySlot> | null>(null)
  const [pageNumber, setPageNumber] = useState(initialSearch.page ?? 1)
  const [loadingReferences, setLoadingReferences] = useState(true)
  const [loading, setLoading] = useState(false)
  const [savingSlotId, setSavingSlotId] = useState<string | null>(null)
  const [patientSearch, setPatientSearch] = useState("")
  const [patientOptions, setPatientOptions] = useState<PatientSummary[]>([])
  const [patientId, setPatientId] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const initialSearchStarted = useRef(false)
  const confirmationDialog = useRef<HTMLDialogElement>(null)
  const continuationSlotId = initialSearch.slotId
  const availabilityDays = results ? groupAvailabilityByArgentinaDay(results.items) : []
  const selectedPatient = patientOptions.find((patient) => patient.id === patientId)

  useEffect(() => {
    const dialog = confirmationDialog.current
    if (!dialog) return
    if (confirmationOpen && !dialog.open) dialog.showModal()
    if (!confirmationOpen && dialog.open) dialog.close()
  }, [confirmationOpen])

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
    if (!rescheduleId || status !== "authenticated") return
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
  }, [rescheduleId, status])

  useEffect(() => {
    if (!rescheduleId || status !== "unauthenticated") return
    const continuation = `/appointments/availability?reschedule=${encodeURIComponent(rescheduleId)}`
    router.replace(`/login?next=${encodeURIComponent(continuation)}`)
  }, [rescheduleId, router, status])

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

  const search = useCallback(async (nextPage = pageNumber): Promise<Page<AvailabilitySlot> | null> => {
    if (!from || !to) {
      setError("Elegí las fechas de inicio y fin.")
      return null
    }
    const fromDate = new Date(`${from}T00:00:00-03:00`)
    const toDate = new Date(`${to}T00:00:00-03:00`)
    if (toDate <= fromDate) {
      setError("La fecha final debe ser posterior a la fecha inicial.")
      return null
    }
    if (toDate.getTime() - fromDate.getTime() > 31 * 24 * 60 * 60 * 1000) {
      setError("El rango de búsqueda no puede superar 31 días.")
      return null
    }

    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const availability = await listAvailability({
        from: toArgentinaInstant(from),
        to: toArgentinaInstant(to),
        ...(specialtyId ? { specialtyId } : {}),
        ...(doctorId ? { doctorId } : {}),
        page: nextPage,
        pageSize: 50,
      })
      setResults(availability)
      const days = groupAvailabilityByArgentinaDay(availability.items)
      setExpandedDate((current) => days.some((day) => day.key === current) ? current : days[0]?.key ?? null)
      return availability
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudo consultar la disponibilidad."))
      setResults(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [doctorId, from, pageNumber, specialtyId, to])

  useEffect(() => {
    if (!continuationSlotId || initialSearchStarted.current) return
    initialSearchStarted.current = true
    void search(initialSearch.page).then((availability) => {
      const selected = availability?.items.find((slot) => slot.id === continuationSlotId)
      if (selected) {
        setSelectedSlot(selected)
        setExpandedDate(argentinaDateKey(selected.startsAt))
        setNotice("El horario que elegiste sigue disponible. Confirmá la solicitud para reservarlo.")
      } else if (availability) {
        setSelectedSlot(null)
        setNotice("El horario que elegiste ya no está disponible. Actualizamos la búsqueda para que elijas otra opción.")
      }
    })
  }, [continuationSlotId, initialSearch.page, search])

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPageNumber(1)
    setSelectedSlot(null)
    setConfirmationOpen(false)
    await search(1)
  }

  function continueToLogin(slot: AvailabilitySlot) {
    const params = new URLSearchParams({
      from,
      to,
      page: String(pageNumber),
      slotId: slot.id,
    })
    if (doctorId) params.set("doctorId", doctorId)
    if (specialtyId) params.set("specialtyId", specialtyId)
    const continuation = `/appointments/availability?${params.toString()}`
    router.push(`/login?next=${encodeURIComponent(continuation)}`)
  }

  function requestConfirmation() {
    if (!selectedSlot) return
    setError(null)
    setConfirmationOpen(true)
  }

  async function confirmSelectedSlot() {
    if (!selectedSlot) return
    if (status === "unauthenticated") {
      continueToLogin(selectedSlot)
      return
    }
    if (status !== "authenticated" || !user) {
      setError("No se pudo comprobar tu sesión. Iniciá sesión nuevamente para solicitar el turno.")
      return
    }
    if (isAdministrative && !patientId) {
      setError("Buscá y seleccioná el paciente para quien se solicita el turno.")
      return
    }
    if (!isAdministrative && user.roles.includes("patient") && !user.patientId) {
      setError("La cuenta no tiene un perfil de paciente asociado para solicitar turnos.")
      return
    }
    await reserve(selectedSlot)
  }

  async function reserve(slot: AvailabilitySlot) {
    if (status !== "authenticated" || !user) {
      setError("No se pudo comprobar tu sesión. Iniciá sesión nuevamente para solicitar el turno.")
      return
    }

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
      if (!rescheduleId) {
        const freshAvailability = await listAvailability({
          from: toArgentinaInstant(from),
          to: toArgentinaInstant(to),
          ...(doctorId ? { doctorId } : {}),
          ...(specialtyId ? { specialtyId } : {}),
          page: pageNumber,
          pageSize: 50,
        })
        if (!freshAvailability.items.some((current) => current.id === slot.id)) {
          await search()
          setNotice("El horario dejó de estar disponible. Actualizamos los horarios; elegí otra opción.")
          return
        }
      }

      const request = {
        slotId: slot.id,
        ...(isAdministrative ? { patientId } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }
      const appointment = rescheduleId
        ? await rescheduleAppointment(rescheduleId, { slotId: slot.id, ...(reason.trim() ? { reason: reason.trim() } : {}) })
        : await createAppointment(request)
      setConfirmationOpen(false)
      router.push(`/appointments/${encodeURIComponent(appointment.id)}`)
    } catch (requestError) {
      const slotUnavailable = requestError instanceof ApiError
        && requestError.status === 409
        && requestError.code === "SLOT_UNAVAILABLE"
      setError(slotUnavailable ? null : getClinicErrorMessage(
        requestError,
        rescheduleId ? "No se pudo reprogramar el turno." : "No se pudo solicitar el turno.",
      ))
      if (slotUnavailable) {
        setSelectedSlot(null)
        setConfirmationOpen(false)
        await search()
        setNotice("La solicitud no se confirmó porque cambió la disponibilidad. Se actualizaron los horarios; elegí otro espacio.")
      }
    } finally {
      setSavingSlotId(null)
    }
  }

  function specialtyChanged(value: string) {
    setSelectedSlot(null)
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
          <FormField id="from" label="Desde" type="date" required value={from} onChange={(event) => { setFrom(event.target.value); setSelectedSlot(null) }} />
          <FormField id="to" label="Hasta (exclusiva)" type="date" required value={to} onChange={(event) => { setTo(event.target.value); setSelectedSlot(null) }} />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Especialidad
            <select value={specialtyId} disabled={Boolean(rescheduleId)} onChange={(event) => specialtyChanged(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 disabled:bg-slate-100">
              <option value="">Todas</option>
              {specialties.map((specialty) => <option key={specialty.id} value={specialty.id}>{specialty.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Profesional
            <select value={doctorId} disabled={Boolean(rescheduleId)} onChange={(event) => { setDoctorId(event.target.value); setSelectedSlot(null) }} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 disabled:bg-slate-100">
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
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ClinicCard>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Elegí un día y horario</h2>
              <span className="text-sm text-slate-600">{results.totalItems} horario{results.totalItems === 1 ? "" : "s"}</span>
            </div>
            {results.items.length === 0 ? (
              <EmptyState title="No hay horarios disponibles" description="Probá con otras fechas, especialidad o profesional." />
            ) : (
              <div className="space-y-3">
                {availabilityDays.map((day) => {
                  const expanded = expandedDate === day.key
                  const dayHasSelection = day.slots.some((slot) => slot.id === selectedSlot?.id)
                  return (
                    <section key={day.key} className="overflow-hidden rounded-xl border border-slate-200">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setExpandedDate(expanded ? null : day.key)}
                        className="flex w-full items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"
                      >
                        <span>
                          <span className="block font-semibold text-slate-900">{day.label}</span>
                          <span className="mt-0.5 block text-sm text-slate-600">{day.slots.length} horario{day.slots.length === 1 ? "" : "s"} disponible{day.slots.length === 1 ? "" : "s"}</span>
                        </span>
                        <span className="flex items-center gap-2 text-sm font-medium text-teal-800">
                          {dayHasSelection && <span>Elegido</span>}
                          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
                        </span>
                      </button>
                      {expanded && (
                        <ul className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
                          {day.slots.map((slot) => {
                            const isSelected = selectedSlot?.id === slot.id
                            return (
                              <li key={slot.id}>
                                <button
                                  type="button"
                                  aria-pressed={isSelected}
                                  disabled={
                                    savingSlotId !== null
                                    || status === "loading"
                                    || (status === "authenticated" && !user?.roles.includes("patient") && !isAdministrative)
                                    || (Boolean(rescheduleId) && !appointmentToReschedule)
                                    || (Boolean(rescheduleId) && !["requested", "confirmed"].includes(appointmentToReschedule?.status ?? ""))
                                  }
                                  onClick={() => setSelectedSlot(slot)}
                                  className={`w-full rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                    isSelected
                                      ? "border-teal-700 bg-teal-700 text-white"
                                      : "border-teal-200 bg-white text-teal-900 hover:border-teal-500 hover:bg-teal-50"
                                  }`}
                                >
                                  {formatAvailabilityTime(slot.startsAt)}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </section>
                  )
                })}
              </div>
            )}
          {results.totalItems > results.pageSize && (
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-sm text-slate-600">Página {results.page}</span>
              <div className="flex gap-2">
                <button type="button" disabled={pageNumber <= 1 || loading} onClick={() => { const nextPage = pageNumber - 1; setPageNumber(nextPage); setSelectedSlot(null); void search(nextPage) }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">Anterior</button>
                <button type="button" disabled={pageNumber * results.pageSize >= results.totalItems || loading} onClick={() => { const nextPage = pageNumber + 1; setPageNumber(nextPage); setSelectedSlot(null); void search(nextPage) }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40">Siguiente</button>
              </div>
            </div>
          )}
          </ClinicCard>
          <div className="lg:sticky lg:top-4">
            <ClinicCard>
              <h2 className="text-lg font-semibold text-slate-900">Tu selección</h2>
              {selectedSlot ? (
                <>
                  <p className="mt-3 font-semibold text-teal-900">{formatAvailabilityDay(selectedSlot.startsAt)}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">{formatAvailabilityTime(selectedSlot.startsAt)} hs</p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div>
                      <dt className="text-slate-500">Profesional</dt>
                      <dd className="font-medium text-slate-900">{selectedSlot.doctor.displayName}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Especialidad</dt>
                      <dd className="font-medium text-slate-900">{selectedSlot.specialty.name}</dd>
                    </div>
                    {selectedPatient && (
                      <div>
                        <dt className="text-slate-500">Paciente</dt>
                        <dd className="font-medium text-slate-900">{selectedPatient.firstName} {selectedPatient.lastName}</dd>
                      </div>
                    )}
                    {reason.trim() && (
                      <div>
                        <dt className="text-slate-500">Motivo</dt>
                        <dd className="font-medium text-slate-900">{reason.trim()}</dd>
                      </div>
                    )}
                  </dl>
                  <button
                    type="button"
                    disabled={
                      savingSlotId !== null
                      || status === "loading"
                      || (status === "authenticated" && !user?.roles.includes("patient") && !isAdministrative)
                      || (Boolean(rescheduleId) && !appointmentToReschedule)
                      || (Boolean(rescheduleId) && !["requested", "confirmed"].includes(appointmentToReschedule?.status ?? ""))
                    }
                    onClick={requestConfirmation}
                    className="mt-5 w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {rescheduleId ? "Confirmar reprogramación" : "Confirmar turno"}
                  </button>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-600">Seleccioná un horario para ver el resumen antes de confirmar.</p>
              )}
            </ClinicCard>
          </div>
        </div>
      )}
      <dialog
        ref={confirmationDialog}
        aria-labelledby="appointment-confirmation-title"
        onCancel={(event) => { event.preventDefault(); setConfirmationOpen(false) }}
        onClose={() => setConfirmationOpen(false)}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"
      >
        {selectedSlot && (
          <div className="p-6">
            <h2 id="appointment-confirmation-title" className="text-xl font-bold">
              {rescheduleId ? "Confirmar reprogramación" : "Confirmar turno"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">Revisá los datos antes de continuar.</p>
            {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">{formatAvailabilityDay(selectedSlot.startsAt)}</p>
              <p className="mt-1 text-lg font-bold text-teal-900">{formatAvailabilityTime(selectedSlot.startsAt)} hs</p>
              <p className="mt-3 text-sm text-slate-700">{selectedSlot.doctor.displayName} · {selectedSlot.specialty.name}</p>
              {selectedPatient && <p className="mt-2 text-sm text-slate-700">Paciente: {selectedPatient.firstName} {selectedPatient.lastName}</p>}
              {reason.trim() && <p className="mt-2 text-sm text-slate-700">Motivo: {reason.trim()}</p>}
            </div>
            {status === "unauthenticated" && (
              <p className="mt-4 text-sm text-slate-600">Para finalizar la solicitud, vas a iniciar sesión y volver a este horario.</p>
            )}
            <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
              <button type="button" onClick={() => setConfirmationOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Volver
              </button>
              <button
                type="button"
                disabled={
                  savingSlotId !== null
                  || status === "loading"
                  || (status === "authenticated" && !user?.roles.includes("patient") && !isAdministrative)
                  || (Boolean(rescheduleId) && !appointmentToReschedule)
                  || (Boolean(rescheduleId) && !["requested", "confirmed"].includes(appointmentToReschedule?.status ?? ""))
                }
                onClick={() => void confirmSelectedSlot()}
                className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingSlotId ? "Procesando..." : status === "unauthenticated" ? "Iniciar sesión para confirmar" : "Confirmar y solicitar"}
              </button>
            </div>
          </div>
        )}
      </dialog>
      {status === "unauthenticated" && (
        <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Podés consultar horarios sin iniciar sesión. Para solicitar uno, iniciá sesión o creá una cuenta de paciente.
        </p>
      )}
      {status === "authenticated" && !user?.roles.includes("patient") && !isAdministrative && (
        <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Este perfil puede consultar horarios, pero el contrato no habilita solicitar turnos con este rol.
        </p>
      )}
      {rescheduleId ? (
        <Link href={`/appointments/${encodeURIComponent(rescheduleId)}`} className="w-fit text-sm font-medium text-teal-800 underline underline-offset-2">
          Volver al turno
        </Link>
      ) : user ? (
        <Link href="/appointments" className="w-fit text-sm font-medium text-teal-800 underline underline-offset-2">
          Ver mis turnos
        </Link>
      ) : null}
    </ClinicPage>
  )
}
