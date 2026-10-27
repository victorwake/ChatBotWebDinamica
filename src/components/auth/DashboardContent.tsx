"use client"

import Link from "next/link"
import { useSession } from "@/contexts/SessionContext"
import { getRoleLabel, type UserRole } from "@/lib/session"

const roleDescriptions: Record<UserRole, string> = {
  patient: "Consultá tus datos de contacto y coberturas, solicitá turnos y revisá su estado.",
  doctor: "Consultá los turnos asociados a tu perfil.",
  administrative: "Gestioná pacientes, coberturas y solicitudes de turnos sin acceso a datos clínicos.",
  administrator: "La administración de cuentas y auditoría se habilitará en su fase específica; este rol no concede acceso clínico.",
}

const roleLinks: Record<UserRole, { href: string; label: string }[]> = {
  patient: [
    { href: "/profile", label: "Ver mi perfil" },
    { href: "/appointments", label: "Mis turnos" },
  ],
  doctor: [{ href: "/appointments", label: "Ir a turnos" }],
  administrative: [
    { href: "/patients", label: "Ir a pacientes" },
    { href: "/appointments/manage", label: "Gestionar turnos" },
  ],
  administrator: [],
}

export default function DashboardContent() {
  const { user } = useSession()
  if (!user) return null

  const links = [...new Map(
    user.roles.flatMap((role) => roleLinks[role]).map((link) => [link.href, link]),
  ).values()]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-7 p-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Panel</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Hola, {user.displayName}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Este panel se adapta a los perfiles asociados a tu cuenta.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {user.roles.map((role) => (
          <section key={role} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{getRoleLabel(role)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{roleDescriptions[role]}</p>
          </section>
        ))}
      </div>

      {links.length > 0 && (
        <nav aria-label="Accesos disponibles" className="flex flex-wrap gap-3">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
