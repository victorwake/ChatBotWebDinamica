"use client"

import { useCallback, useEffect, useState } from "react"
import { ClinicPage } from "@/components/clinic/ClinicPrimitives"
import { ConsultationCards, ConsultationPager, isClinicalViewer } from "@/components/clinical/ConsultationCards"
import { EmptyState, ErrorState, FormField, LoadingState } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"
import { getClinicErrorMessage, listConsultations, type ClinicalConsultation, type Page } from "@/lib/clinic"

const pageSize = 20

export default function ClinicalConsultationList() {
  const { user } = useSession()
  const allowed = isClinicalViewer(user?.roles ?? [])
  const [result, setResult] = useState<Page<ClinicalConsultation> | null>(null)
  const [page, setPage] = useState(1)
  const [fromInput, setFromInput] = useState("")
  const [toInput, setToInput] = useState("")
  const [filters, setFilters] = useState<{ from?: string; to?: string }>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!allowed) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await listConsultations({ ...filters, page, pageSize }))
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudieron cargar las atenciones."))
    } finally {
      setLoading(false)
    }
  }, [allowed, filters, page])

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
      title="Atenciones"
      description="Consultá las atenciones autorizadas para tu perfil. El acceso a cada registro se valida en el servidor."
    >
      {!allowed && (
        <EmptyState title="Acceso no disponible" description="Este perfil no tiene acceso a información clínica." />
      )}
      {allowed && error && <ErrorState description={error} onRetry={() => void load()} />}
      {allowed && (
        <>
          <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-5">
            <FormField id="consultations-from" label="Desde (inclusiva)" type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} />
            <FormField id="consultations-to" label="Hasta (exclusiva)" type="date" value={toInput} onChange={(event) => setToInput(event.target.value)} />
            <button type="button" onClick={applyFilters} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
              Aplicar fechas
            </button>
          </section>
          {loading && <LoadingState label="Cargando atenciones..." />}
          {!loading && result?.items.length === 0 && (
            <EmptyState title="No hay atenciones para mostrar" description="Las atenciones autorizadas para este perfil aparecerán aquí." />
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
