"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ClinicCard, ClinicPage } from "@/components/clinic/ClinicPrimitives"
import AdministrationAccess from "@/components/administration/AdministrationAccess"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"
import { getRoleLabel, type UserRole } from "@/lib/session"
import {
  getAccount,
  getAdministrationErrorMessage,
  updateAccount,
  type Account,
} from "@/lib/administration"

const roles: UserRole[] = ["patient", "doctor", "administrative", "administrator"]

export default function AccountDetail({ userId }: { userId: string }) {
  const { user } = useSession()
  const isAdministrator = Boolean(user?.roles.includes("administrator"))
  const [account, setAccount] = useState<Account | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([])
  const [active, setActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isAdministrator) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setAccount(null)
    try {
      const result = await getAccount(userId)
      setAccount(result)
      setSelectedRoles(result.roles)
      setActive(result.active)
    } catch (requestError) {
      setError(getAdministrationErrorMessage(requestError, "No se pudo cargar la cuenta."))
    } finally {
      setLoading(false)
    }
  }, [isAdministrator, userId])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  function toggleRole(role: UserRole) {
    setSelectedRoles((current) => current.includes(role)
      ? current.filter((value) => value !== role)
      : roles.filter((value) => value === role || current.includes(value)))
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!account) return
    if (selectedRoles.length === 0) {
      setError("La cuenta debe conservar al menos un perfil.")
      return
    }
    const rolesChanged = roles.some((role) => selectedRoles.includes(role) !== account.roles.includes(role))
    const activeChanged = active !== account.active
    if (!rolesChanged && !activeChanged) {
      setNotice("No hay cambios para guardar.")
      setError(null)
      return
    }
    const changes = [
      ...(activeChanged ? [`estado ${account.active ? "activa" : "inactiva"} → ${active ? "activa" : "inactiva"}`] : []),
      ...(rolesChanged ? [`perfiles ${account.roles.map(getRoleLabel).join(", ") || "ninguno"} → ${selectedRoles.map(getRoleLabel).join(", ")}`] : []),
    ]
    if (!window.confirm(`¿Confirmás los cambios de ${account.displayName}?\n\n${changes.join("\n")}`)) return

    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await updateAccount(userId, {
        ...(activeChanged ? { active } : {}),
        ...(rolesChanged ? { roles: selectedRoles } : {}),
      })
      setAccount(updated)
      setSelectedRoles(updated.roles)
      setActive(updated.active)
      setNotice("Los cambios de la cuenta se guardaron.")
    } catch (requestError) {
      setError(getAdministrationErrorMessage(requestError, "No se pudieron guardar los cambios de la cuenta."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdministrationAccess>
      <ClinicPage
        eyebrow="Administración del sistema"
        title={account?.displayName ?? "Cuenta de usuario"}
        description="Revisá el estado y los perfiles asignados. No se muestran credenciales ni datos clínicos."
      >
        {loading && <LoadingState label="Cargando cuenta..." />}
        {error && <ErrorState description={error} onRetry={() => void load()} />}
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
        {!loading && !error && !account && (
          <EmptyState title="Cuenta no disponible" description="No se encontró la cuenta solicitada." />
        )}
        {account && (
          <ClinicCard>
            <dl className="grid gap-5 border-b border-slate-100 pb-5 sm:grid-cols-2">
              <Detail label="Email" value={account.email} />
              <Detail label="Identificador" value={account.id} />
            </dl>
            <form className="mt-5 space-y-6" onSubmit={save}>
              <fieldset>
                <legend className="text-sm font-semibold text-slate-900">Perfiles</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {roles.map((role) => (
                    <label key={role} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role)}
                        onChange={() => toggleRole(role)}
                        className="h-4 w-4 accent-teal-700"
                      />
                      {getRoleLabel(role)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4 accent-teal-700" />
                Cuenta activa
              </label>
              <p className="text-sm text-slate-600">
                El servidor protege la cuenta administradora actual y exige conservar al menos una cuenta administradora activa. Si una regla de negocio impide el cambio, se mostrará el motivo devuelto por la API.
              </p>
              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={busy} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? "Guardando..." : "Guardar cambios"}
                </button>
                <Link href="/users" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
                  Volver a cuentas
                </Link>
              </div>
            </form>
          </ClinicCard>
        )}
      </ClinicPage>
    </AdministrationAccess>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-all text-sm text-slate-900">{value}</dd>
    </div>
  )
}
