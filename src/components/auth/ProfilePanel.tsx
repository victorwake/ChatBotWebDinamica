"use client"

import Link from "next/link"
import { useSession } from "@/contexts/SessionContext"
import { getRoleLabel } from "@/lib/session"

export default function ProfilePanel() {
  const { user } = useSession()

  if (!user) return null

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Mi cuenta</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{user.displayName}</h1>
      <p className="mt-1 text-sm text-slate-600">{user.email}</p>

      <dl className="mt-7 grid gap-5 border-t border-slate-100 pt-6 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Identificador de cuenta</dt>
          <dd className="mt-1 break-all text-sm font-medium text-slate-800">{user.id}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Perfiles habilitados</dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            {user.roles.map((role) => (
              <span key={role} className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-900">
                {getRoleLabel(role)}
              </span>
            ))}
          </dd>
        </div>
        {user.patientId && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Perfil de paciente</dt>
            <dd className="mt-1 break-all text-sm font-medium text-slate-800">
              <Link href={`/patients/${encodeURIComponent(user.patientId)}`} className="text-teal-800 underline underline-offset-2">
                Ver datos y coberturas
              </Link>
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-6 text-xs text-slate-500">
        La contraseña y la cookie de sesión no se muestran ni se guardan en el navegador.
      </p>
    </section>
  )
}
