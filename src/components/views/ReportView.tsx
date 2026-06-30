export default function ReportView(_props: { data?: Record<string, unknown> }) {
  return (
    <div className="flex flex-1 flex-col p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-800">Informe médico</h2>
        <p className="text-xs text-slate-400">Resumen y análisis clínico</p>
      </div>
      <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <span className="text-2xl">📊</span>
          <div>
            <p className="font-semibold text-slate-800">Sin datos</p>
            <p className="text-xs text-slate-400">No hay información para mostrar</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">
          Solicitá un informe específico desde el chat para ver los resultados aquí.
        </p>
      </div>
    </div>
  )
}
