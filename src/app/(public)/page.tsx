import Link from "next/link"

const shortcuts = [
  { title: "Iniciar sesión", description: "Acceso al sistema", href: "/login" },
  { title: "Buscar turnos", description: "Consultá disponibilidad sin iniciar sesión", href: "/appointments/availability" },
  { title: "Especialidades", description: "Explorá las especialidades disponibles", href: "/specialties" },
  { title: "Profesionales", description: "Conocé los profesionales habilitados", href: "/doctors" },
]

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 p-6 pb-28">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Consultorio</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
          Gestión clínica guiada por conversación.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-500 md:text-base">
          Explorá profesionales, especialidades y horarios disponibles. Para solicitar un turno, iniciá sesión
          o creá una cuenta de paciente.
        </p>
      </div>

      <nav aria-label="Accesos rápidos" className="grid gap-3 sm:grid-cols-2">
        {shortcuts.map(({ title, description, href }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <p className="text-sm font-semibold text-slate-800">{title}</p>
            <p className="mt-1 text-xs text-slate-500">{description}</p>
            <span className="mt-4 inline-block text-xs font-medium text-teal-700 group-hover:underline">
              Abrir
            </span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
