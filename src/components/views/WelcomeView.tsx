import type { ViewProps } from "@/types"
import { demoDataEnabled } from "@/lib/demo-data"

const COMMANDS = [
  { label: "Iniciar sesión", hint: "Acceso al sistema", view: "login" as const },
  {
    label: "Ver pacientes",
    hint: "Listado del consultorio",
    view: "patients" as const,
  },
  { label: "Agendar turno", hint: "Nueva cita", view: "appointment" as const },
  { label: "Ver informe", hint: "Resumen clínico", view: "report" as const },
]

export default function WelcomeView({ onAction }: ViewProps) {
  async function handleCommand(view: (typeof COMMANDS)[number]["view"]) {
    if (view === "patients" && demoDataEnabled) {
      const { mockPatients } = await import("@/data/mockPatients")
      onAction?.({ view, data: { patients: mockPatients } })
      return
    }
    onAction?.({ view })
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10">
      <div className="max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">Consultorio</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
          Gestión clínica guiada por conversación.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-500 md:text-base">
          Pedile al asistente pacientes, fichas, turnos o informes. También podés usar los atajos de abajo.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {COMMANDS.map((cmd) => (
          <button
            key={cmd.view}
            type="button"
            onClick={() => void handleCommand(cmd.view)}
            className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
          >
            <p className="text-sm font-semibold text-slate-800">{cmd.label}</p>
            <p className="mt-1 text-xs text-slate-500">{cmd.hint}</p>
            <span className="mt-4 inline-block text-xs font-medium text-teal-700 group-hover:underline">
              Abrir
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
