import FeaturePlaceholder from "@/components/ui/FeaturePlaceholder"
import { demoDataEnabled } from "@/lib/demo-data"

const KPIS = [
  { label: "Consultas del mes", value: "48", hint: "Demo" },
  { label: "Pacientes activos", value: "7", hint: "Listado mock" },
  { label: "Turnos pendientes", value: "3", hint: "Demo" },
]

export default function ReportView() {
  if (!demoDataEnabled) {
    return (
      <FeaturePlaceholder
        title="Los informes aún no están disponibles"
        description="No mostramos métricas de ejemplo como información real."
        phase="Datos de demostración desactivados"
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Informe médico</h2>
        <p className="mt-1 text-sm text-slate-500">Resumen de actividad del consultorio (datos de demostración)</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {KPIS.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{kpi.label}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{kpi.value}</p>
            <p className="mt-1 text-xs text-slate-400">{kpi.hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-slate-800">Actividad semanal</p>
        <p className="mt-1 text-xs text-slate-400">Placeholder visual — no hay backend de métricas</p>
        <svg viewBox="0 0 320 120" className="mt-6 h-32 w-full text-teal-600" aria-hidden>
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
            points="0,90 40,70 80,78 120,40 160,52 200,28 240,44 280,22 320,36"
          />
          <polyline
            fill="url(#fade)"
            stroke="none"
            points="0,120 0,90 40,70 80,78 120,40 160,52 200,28 240,44 280,22 320,36 320,120"
            opacity="0.12"
          />
        </svg>
      </div>
    </div>
  )
}
