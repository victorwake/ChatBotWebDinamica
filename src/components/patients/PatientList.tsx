"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { EmptyState, ErrorState, FormField, LoadingState } from "@/components/ui/states"
import { ClinicCard, ClinicPage } from "@/components/clinic/ClinicPrimitives"
import { getClinicErrorMessage, listPatients, type Page, type PatientSummary } from "@/lib/clinic"
import { useSession } from "@/contexts/SessionContext"

export default function PatientList() {
  const { user } = useSession()
  const [page, setPage] = useState<Page<PatientSummary> | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [searchText, setSearchText] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (nextSearch = search, nextPage = pageNumber) => {
    if (!user?.roles.includes("administrative")) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setPage(await listPatients({ search: nextSearch || undefined, page: nextPage, pageSize: 20 }))
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudo cargar el listado de pacientes."))
    } finally {
      setLoading(false)
    }
  }, [pageNumber, search, user])

  useEffect(() => { void Promise.resolve().then(() => load()) }, [load])

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextSearch = searchText.trim()
    setPageNumber(1)
    setSearch(nextSearch)
  }

  return (
    <ClinicPage
      eyebrow="Pacientes"
      title="Gestión de pacientes"
      description="Buscá pacientes por nombre, apellido o documento. Los datos se consultan directamente a la API."
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <form className="flex w-full max-w-2xl flex-wrap items-end gap-3" onSubmit={submitSearch}>
          <div className="min-w-60 flex-1">
            <FormField
              id="patient-search"
              label="Buscar"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              maxLength={100}
              placeholder="Nombre, apellido o documento"
            />
          </div>
          <button type="submit" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Buscar
          </button>
          <Link href="/patients/new" className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
            Registrar paciente
          </Link>
        </form>
      </div>

      {user?.roles.includes("administrative") && loading && <LoadingState label="Cargando pacientes..." />}
      {!user?.roles.includes("administrative") && (
        <ErrorState description="La lista general de pacientes está disponible únicamente para el personal administrativo." />
      )}
      {error && <ErrorState description={error} onRetry={() => void load()} />}
      {user?.roles.includes("administrative") && !loading && !error && page && (
        <ClinicCard>
          {page.items.length === 0 ? (
            <EmptyState
              title={search ? "No se encontraron pacientes" : "Todavía no hay pacientes"}
              description={search ? "Probá con otro nombre, apellido o documento." : "Cuando se registren pacientes, aparecerán en este listado."}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3 font-medium">Paciente</th>
                    <th className="px-3 py-3 font-medium">Teléfono</th>
                    <th className="px-3 py-3 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((patient) => (
                    <tr key={patient.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-3 font-medium text-slate-900">{patient.firstName} {patient.lastName}</td>
                      <td className="px-3 py-3 text-slate-600">{patient.phone ?? "—"}</td>
                      <td className="px-3 py-3">
                        <Link className="font-medium text-teal-800 underline underline-offset-2" href={`/patients/${encodeURIComponent(patient.id)}`}>
                          Ver ficha
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm">
            <span className="text-slate-600">
              {page.totalItems} resultado{page.totalItems === 1 ? "" : "s"} · página {page.page}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pageNumber <= 1 || loading}
                onClick={() => {
                  const nextPage = Math.max(1, pageNumber - 1)
                  setPageNumber(nextPage)
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={!page || pageNumber * page.pageSize >= page.totalItems || loading}
                onClick={() => {
                  const nextPage = pageNumber + 1
                  setPageNumber(nextPage)
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </ClinicCard>
      )}
    </ClinicPage>
  )
}
