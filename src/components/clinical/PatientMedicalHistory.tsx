"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ClinicPage } from "@/components/clinic/ClinicPrimitives"
import { ConsultationCards, ConsultationPager, isClinicalPatientOwner } from "@/components/clinical/ConsultationCards"
import { EmptyState, ErrorState, FormField, LoadingState } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"
import {
  getClinicErrorMessage,
  listPatientMedicalHistory,
  type ClinicalConsultation,
  type Page,
} from "@/lib/clinic"

const pageSize = 20

export default function PatientMedicalHistory({ patientId }: { patientId: string }) {
  const { user } = useSession()
  const canView = user?.roles.includes("patient")
    ? isClinicalPatientOwner(user.roles, user.patientId, patientId)
    : Boolean(user?.roles.includes("doctor"))
  const [result, setResult] = useState<Page<ClinicalConsultation> | null>(null)
  const [page, setPage] = useState(1)
  const [fromInput, setFromInput] = useState("")
  const [toInput, setToInput] = useState("")
  const [filters, setFilters] = useState<{ from?: string; to?: string }>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await listPatientMedicalHistory(patientId, { ...filters, page, pageSize }))
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudo cargar el historial clínico."))
    } finally {
      setLoading(false)
    }
  }, [canView, filters, page, patientId])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  function applyFilters() {
    if ((fromInput && !toInput) || (!fromInput && toInput) || (fromInput && toInput && fromInput >= toInput)) {
      setError("Completá ambas fechas y verificá que la fecha final sea posterior a la inicial.")
      return
    }
    setPage(1)
    setFilters(fromInput && toInput ? { from: fromInput, to: toInput } : {})
  }

  return (
    <ClinicPage
      eyebrow="Atención clínica"
      title="Historial clínico"
      description="El historial se obtiene de la API y solo está disponible para el paciente titular o un profesional con relación asistencial."
    >
      {!canView && (
        <EmptyState
          title="Acceso no disponible"
          description="Este perfil no puede consultar el historial clínico solicitado."
          action={<Link href="/dashboard" className="font-medium text-teal-800 underline">Volver al panel</Link>}
        />
      )}
      {canView && error && <ErrorState description={error} onRetry={() => void load()} />}
      {canView && (
        <>
          <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5">
            <FormField id="history-from" label="Desde (inclusiva)" type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} />
            <FormField id="history-to" label="Hasta (exclusiva)" type="date" value={toInput} onChange={(event) => setToInput(event.target.value)} />
            <button type="button" onClick={applyFilters} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
              Aplicar fechas
            </button>
          </section>
          {loading && <LoadingState label="Cargando historial clínico..." />}
          {!loading && result?.items.length === 0 && (
            <EmptyState title="Historial sin atenciones" description="No hay atenciones registradas para los filtros seleccionados." />
          )}
          {!loading && result && result.items.length > 0 && (
            <>
              <ConsultationCards items={result.items} />
              <ConsultationPager
                page={result.page}
                pageSize={result.pageSize}
                totalItems={result.totalItems}
                onPageChange={setPage}
              />
            </>
          )}
        </>
      )}
    </ClinicPage>
  )
}
