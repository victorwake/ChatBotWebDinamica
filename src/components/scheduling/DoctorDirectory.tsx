"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ClinicCard, ClinicPage } from "@/components/clinic/ClinicPrimitives"
import { EmptyState, ErrorState, FormField, LoadingState } from "@/components/ui/states"
import {
  getClinicErrorMessage,
  listDoctors,
  listSpecialties,
  type Doctor,
  type Specialty,
} from "@/lib/clinic"

export default function DoctorDirectory({ initialSpecialtyId }: { initialSpecialtyId?: string }) {
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [specialtyId, setSpecialtyId] = useState(initialSpecialtyId ?? "")
  const [search, setSearch] = useState("")
  const [specialtiesLoading, setSpecialtiesLoading] = useState(true)
  const [doctorsLoading, setDoctorsLoading] = useState(true)
  const [specialtiesError, setSpecialtiesError] = useState<string | null>(null)
  const [doctorsError, setDoctorsError] = useState<string | null>(null)
  const doctorRequestId = useRef(0)

  const loadSpecialties = useCallback(async () => {
    setSpecialtiesLoading(true)
    setSpecialtiesError(null)
    try {
      const result = await listSpecialties()
      setSpecialties(result)
      if (initialSpecialtyId && !result.some((item) => item.id === initialSpecialtyId)) {
        setSpecialtyId("")
      }
    } catch (error) {
      setSpecialtiesError(getClinicErrorMessage(error, "No se pudieron cargar las especialidades."))
    } finally {
      setSpecialtiesLoading(false)
    }
  }, [initialSpecialtyId])

  const loadDoctors = useCallback(async () => {
    const requestId = ++doctorRequestId.current
    setDoctorsLoading(true)
    setDoctorsError(null)
    try {
      const result = await listDoctors(specialtyId || undefined)
      if (requestId === doctorRequestId.current) setDoctors(result)
    } catch (error) {
      if (requestId === doctorRequestId.current) {
        setDoctorsError(getClinicErrorMessage(error, "No se pudieron cargar los profesionales."))
      }
    } finally {
      if (requestId === doctorRequestId.current) setDoctorsLoading(false)
    }
  }, [specialtyId])

  useEffect(() => { void Promise.resolve().then(loadSpecialties) }, [loadSpecialties])
  useEffect(() => {
    void Promise.resolve().then(loadDoctors)
    return () => { doctorRequestId.current += 1 }
  }, [loadDoctors])

  const visibleDoctors = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es-AR")
    if (!normalizedSearch) return doctors
    return doctors.filter((doctor) =>
      doctor.displayName.toLocaleLowerCase("es-AR").includes(normalizedSearch),
    )
  }, [doctors, search])

  return (
    <ClinicPage
      eyebrow="Atención"
      title="Profesionales"
      description="Consultá los profesionales habilitados para la atención y filtrá por especialidad."
    >
      <ClinicCard>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="doctor-specialty" className="mb-1.5 block text-sm font-medium text-slate-700">
              Especialidad
            </label>
            {specialtiesLoading ? (
              <p className="text-sm text-slate-500">Cargando especialidades...</p>
            ) : specialtiesError ? (
              <ErrorState description={specialtiesError} onRetry={() => void loadSpecialties()} />
            ) : (
              <select
                id="doctor-specialty"
                value={specialtyId}
                onChange={(event) => setSpecialtyId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                <option value="">Todas las especialidades</option>
                {specialties.map((specialty) => (
                  <option key={specialty.id} value={specialty.id}>{specialty.name}</option>
                ))}
              </select>
            )}
          </div>
          <FormField
            id="doctor-search"
            label="Buscar profesional"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre del profesional"
          />
        </div>
      </ClinicCard>

      {doctorsError && <ErrorState description={doctorsError} onRetry={() => void loadDoctors()} />}
      {doctorsLoading && <LoadingState label="Cargando profesionales..." />}
      {!doctorsLoading && !doctorsError && doctors.length === 0 && (
        <EmptyState
          title="No hay profesionales para mostrar"
          description="No se encontraron profesionales habilitados para la especialidad seleccionada."
        />
      )}
      {!doctorsLoading && !doctorsError && doctors.length > 0 && visibleDoctors.length === 0 && (
        <EmptyState
          title="No hay coincidencias"
          description="Probá con otro nombre o cambiá la especialidad."
        />
      )}
      {!doctorsLoading && !doctorsError && visibleDoctors.length > 0 && (
        <section aria-label="Listado de profesionales" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleDoctors.map((doctor) => (
            <ClinicCard key={doctor.id}>
              <div className="flex h-full flex-col">
                <span
                  aria-hidden="true"
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-lg font-semibold text-teal-800"
                >
                  {doctor.displayName.trim().charAt(0).toLocaleUpperCase("es-AR")}
                </span>
                <h2 className="text-base font-semibold text-slate-900">{doctor.displayName}</h2>
                <p className="mt-1 text-sm text-slate-600">{doctor.specialty.name}</p>
              </div>
            </ClinicCard>
          ))}
        </section>
      )}
    </ClinicPage>
  )
}
