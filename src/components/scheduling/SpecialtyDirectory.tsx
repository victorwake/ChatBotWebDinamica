"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { ClinicCard, ClinicPage } from "@/components/clinic/ClinicPrimitives"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { getClinicErrorMessage, listSpecialties, type Specialty } from "@/lib/clinic"

export default function SpecialtyDirectory() {
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSpecialties(await listSpecialties())
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudieron cargar las especialidades."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  return (
    <ClinicPage
      eyebrow="Atención"
      title="Especialidades"
      description="Consultá las especialidades disponibles para la atención y la reserva de turnos."
    >
      {error && <ErrorState description={error} onRetry={() => void load()} />}
      {loading && <LoadingState label="Cargando especialidades..." />}
      {!loading && !error && specialties.length === 0 && (
        <EmptyState
          title="No hay especialidades para mostrar"
          description="Las especialidades habilitadas aparecerán aquí cuando estén disponibles."
        />
      )}
      {!loading && !error && specialties.length > 0 && (
        <section aria-label="Listado de especialidades" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {specialties.map((specialty) => (
            <ClinicCard key={specialty.id}>
              <div className="flex h-full flex-col items-start">
                <span
                  aria-hidden="true"
                  className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-800"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
                  </svg>
                </span>
                <h2 className="text-base font-semibold text-slate-900">{specialty.name}</h2>
                <Link
                  href={`/doctors?specialtyId=${encodeURIComponent(specialty.id)}`}
                  className="mt-4 text-sm font-semibold text-teal-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                >
                  Ver profesionales
                </Link>
              </div>
            </ClinicCard>
          ))}
        </section>
      )}
    </ClinicPage>
  )
}
