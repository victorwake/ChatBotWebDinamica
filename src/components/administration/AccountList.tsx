"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ClinicCard, ClinicPage } from "@/components/clinic/ClinicPrimitives"
import AdministrationAccess from "@/components/administration/AdministrationAccess"
import { EmptyState, ErrorState, FormField, LoadingState } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"
import { getRoleLabel } from "@/lib/session"
import type { UserRole } from "@/lib/session"
import {
  getAdministrationErrorMessage,
  listAccounts,
  type Account,
} from "@/lib/administration"
import type { Page } from "@/lib/clinic"

const pageSize = 20
const roles: UserRole[] = ["patient", "doctor", "administrative", "administrator"]

export default function AccountList() {
  const { user } = useSession()
  const isAdministrator = Boolean(user?.roles.includes("administrator"))
  const [result, setResult] = useState<Page<Account> | null>(null)
  const [page, setPage] = useState(1)
  const [searchText, setSearchText] = useState("")
  const [search, setSearch] = useState("")
  const [role, setRole] = useState<UserRole | "">("")
  const [active, setActive] = useState<"all" | "active" | "inactive">("all")
  const [filters, setFilters] = useState<{ search?: string; role?: UserRole; active?: boolean }>({})
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
      setResult(await listAccounts({ ...filters, page, pageSize }))
    } catch (requestError) {
      setError(getAdministrationErrorMessage(requestError, "No se pudieron cargar las cuentas."))
    } finally {
      setLoading(false)
    }
  }, [filters, isAdministrator, page])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setFilters({
      ...(searchText.trim() ? { search: searchText.trim() } : {}),
      ...(role ? { role } : {}),
      ...(active === "all" ? {} : { active: active === "active" }),
    })
    setSearch(searchText.trim())
  }

  return (
    <AdministrationAccess>
      <ClinicPage
        eyebrow="Administración del sistema"
        title="Cuentas de usuario"
        description="Buscá cuentas y revisá sus perfiles y estado de acceso. El alta de cuentas y las credenciales se gestionan por el procedimiento privado de provisión."
      >
        <form onSubmit={applyFilters} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
          <FormField
            id="account-search"
            label="Buscar nombre o email"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            maxLength={100}
          />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Perfil
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole | "")} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5">
              <option value="">Todos</option>
              {roles.map((item) => <option key={item} value={item}>{getRoleLabel(item)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Estado
            <select value={active} onChange={(event) => setActive(event.target.value as typeof active)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5">
              <option value="all">Todos</option>
              <option value="active">Activa</option>
              <option value="inactive">Inactiva</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">
              Aplicar filtros
            </button>
          </div>
        </form>

        {error && <ErrorState description={error} onRetry={() => void load()} />}
        {loading && <LoadingState label="Cargando cuentas..." />}
        {!loading && !error && result?.items.length === 0 && (
          <EmptyState title="No hay cuentas para mostrar" description={search ? "No se encontraron cuentas con esos filtros." : "No hay cuentas que coincidan con los filtros seleccionados."} />
        )}
        {!loading && !error && result && result.items.length > 0 && (
          <ClinicCard>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3 font-medium">Cuenta</th>
                    <th className="px-3 py-3 font-medium">Perfiles</th>
                    <th className="px-3 py-3 font-medium">Estado</th>
                    <th className="px-3 py-3 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((account) => (
                    <tr key={account.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-3">
                        <span className="block font-medium text-slate-900">{account.displayName}</span>
                        <span className="text-slate-600">{account.email}</span>
                      </td>
                      <td className="px-3 py-3">{account.roles.map(getRoleLabel).join(" · ") || "Sin perfiles"}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${account.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                          {account.active ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/users/${encodeURIComponent(account.id)}`} className="font-medium text-teal-800 underline underline-offset-2">
                          Revisar cuenta
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm">
              <span className="text-slate-600">{result.totalItems} cuenta{result.totalItems === 1 ? "" : "s"} · página {result.page}</span>
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
