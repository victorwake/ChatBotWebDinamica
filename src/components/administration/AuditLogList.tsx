"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ClinicCard, ClinicPage, formatDateTime } from "@/components/clinic/ClinicPrimitives"
import AdministrationAccess from "@/components/administration/AdministrationAccess"
import { EmptyState, ErrorState, FormField, LoadingState } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"
import {
  getAdministrationErrorMessage,
  listAuditLogs,
  type AuditLog,
  type AuditLogFilters,
} from "@/lib/administration"
import type { Page } from "@/lib/clinic"

const pageSize = 25

export default function AuditLogList() {
  const { user } = useSession()
  const isAdministrator = Boolean(user?.roles.includes("administrator"))
  const [result, setResult] = useState<Page<AuditLog> | null>(null)
  const [page, setPage] = useState(1)
  const [actorInput, setActorInput] = useState("")
  const [actionInput, setActionInput] = useState("")
  const [resourceInput, setResourceInput] = useState("")
  const [fromInput, setFromInput] = useState("")
  const [toInput, setToInput] = useState("")
  const [filters, setFilters] = useState<AuditLogFilters>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isAdministrator) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await listAuditLogs({ ...filters, page, pageSize }))
    } catch (requestError) {
      setError(getAdministrationErrorMessage(requestError, "No se pudo cargar la auditoría."))
    } finally {
      setLoading(false)
    }
  }, [filters, isAdministrator, page])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const actorId = actorInput.trim()
    const resourceId = resourceInput.trim()
    if ((actorId && !/^[1-9]\d{0,9}$/.test(actorId)) || (resourceId && !/^[1-9]\d{0,9}$/.test(resourceId))) {
      setError("Los identificadores deben ser números positivos.")
      return
    }
    if ((fromInput && !toInput) || (!fromInput && toInput) || (fromInput && toInput && fromInput > toInput)) {
      setError("Completá ambas fechas y verificá que la fecha inicial no sea posterior a la final.")
      return
    }
    setPage(1)
    setFilters({
      ...(actorId ? { actorId } : {}),
      ...(actionInput.trim() ? { action: actionInput.trim() } : {}),
      ...(resourceId ? { resourceId } : {}),
      ...(fromInput && toInput ? { from: fromInput, to: toInput } : {}),
    })
  }

  return (
    <AdministrationAccess>
      <ClinicPage
        eyebrow="Administración del sistema"
        title="Auditoría de cuentas"
        description="Consultá los eventos de cambios en cuentas de usuario. La API solo expone metadatos de auditoría, sin snapshots, credenciales ni contenido clínico."
      >
        <form onSubmit={applyFilters} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
          <FormField id="audit-actor" label="ID del administrador" inputMode="numeric" value={actorInput} onChange={(event) => setActorInput(event.target.value)} />
          <FormField id="audit-action" label="Acción exacta" value={actionInput} onChange={(event) => setActionInput(event.target.value)} maxLength={100} placeholder="account.updated" />
          <FormField id="audit-resource" label="ID de cuenta afectada" inputMode="numeric" value={resourceInput} onChange={(event) => setResourceInput(event.target.value)} />
          <FormField id="audit-from" label="Desde (inclusive)" type="date" value={fromInput} onChange={(event) => setFromInput(event.target.value)} />
          <FormField id="audit-to" label="Hasta (inclusive)" type="date" value={toInput} onChange={(event) => setToInput(event.target.value)} />
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">
              Aplicar filtros
            </button>
          </div>
        </form>

        {error && <ErrorState description={error} onRetry={() => void load()} />}
        {loading && <LoadingState label="Cargando eventos de auditoría..." />}
        {!loading && !error && result?.items.length === 0 && (
          <EmptyState title="No hay eventos para mostrar" description="No se encontraron eventos de auditoría con esos filtros." />
        )}
        {!loading && !error && result && result.items.length > 0 && (
          <ClinicCard>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3 font-medium">Fecha y hora</th>
                    <th className="px-3 py-3 font-medium">Administrador (ID)</th>
                    <th className="px-3 py-3 font-medium">Acción</th>
                    <th className="px-3 py-3 font-medium">Cuenta afectada (ID)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-3">{formatDateTime(entry.occurredAt)}</td>
                      <td className="px-3 py-3">{entry.actorId}</td>
                      <td className="px-3 py-3 font-mono text-xs">{entry.action}</td>
                      <td className="px-3 py-3">{entry.resourceId ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm">
              <span className="text-slate-600">{result.totalItems} evento{result.totalItems === 1 ? "" : "s"} · página {result.page}</span>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40">Anterior</button>
                <button type="button" disabled={page * result.pageSize >= result.totalItems || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-40">Siguiente</button>
              </div>
            </div>
          </ClinicCard>
        )}
      </ClinicPage>
    </AdministrationAccess>
  )
}
