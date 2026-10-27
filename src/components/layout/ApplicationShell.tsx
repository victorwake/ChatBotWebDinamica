"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import type { ReactNode } from "react"
import { useSession } from "@/contexts/SessionContext"
import { getRoleLabel } from "@/lib/session"
import LogoutButton from "@/components/auth/LogoutButton"

const baseLinks = [{ href: "/", label: "Inicio" }]

export default function ApplicationShell({
  children,
}: {
  children: ReactNode
}) {
  const pathname = usePathname()
  const { user, status } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const links = [
    ...baseLinks,
    ...(user
      ? [
          { href: "/dashboard", label: "Panel" },
          ...(user.roles.includes("administrative")
            ? [{ href: "/patients", label: "Pacientes" }]
            : []),
          ...(user.roles.some((role) => role !== "administrator")
            ? [{ href: "/appointments", label: "Turnos" }]
            : []),
          ...(user.roles.includes("administrative")
            ? [{ href: "/appointments/manage", label: "Gestión de turnos" }]
            : []),
          { href: "/profile", label: "Mi perfil" },
        ]
      : []),
    ...(status === "unauthenticated" || status === "error"
      ? [{ href: "/login", label: "Acceso" }]
      : []),
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-white p-3 text-teal-900 focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Saltar al contenido
      </a>
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-between gap-4">
            <Link className="flex w-fit items-center gap-3" href="/">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M12 4v16M4 12h16" />
                </svg>
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">Consultorio</span>
                <span className="block text-[11px] text-slate-500">Gestión de atención</span>
              </span>
            </Link>
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 md:hidden"
              aria-expanded={menuOpen}
              aria-controls="primary-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              Menú
            </button>
          </div>
          <nav
            id="primary-navigation"
            aria-label="Navegación principal"
            className={`${menuOpen ? "block" : "hidden"} -mx-1 overflow-x-auto md:block`}
          >
            <ul className="flex min-w-max items-center gap-1">
              {links.map(({ href, label }) => {
                const isCurrent = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`))

                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={isCurrent ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={`block rounded-lg px-3 py-2 text-sm transition ${
                        isCurrent
                          ? "bg-teal-50 font-medium text-teal-800"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      {label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
          {user && (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 md:border-0 md:pt-0">
              <span className="text-right">
                <span className="block text-sm font-medium text-slate-800">{user.displayName}</span>
                <span className="block text-xs text-slate-500">{user.roles.map(getRoleLabel).join(" · ")}</span>
              </span>
              <LogoutButton />
            </div>
          )}
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 flex-col overflow-hidden bg-background outline-none"
      >
        {children}
      </main>
    </div>
  )
}
