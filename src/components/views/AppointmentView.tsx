export default function AppointmentView(_props: { data?: Record<string, unknown> }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-md shadow-blue-200">
            📅
          </div>
          <h2 className="text-lg font-semibold text-slate-800">Nuevo turno</h2>
          <p className="mt-1 text-xs text-slate-400">Completá los datos para agendar</p>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Paciente</label>
            <input
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              placeholder="Nombre del paciente"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Fecha</label>
            <input
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              type="date"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Motivo</label>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              placeholder="Motivo de la consulta"
              rows={3}
            />
          </div>
          <button className="mt-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 py-2.5 text-sm font-medium text-white shadow-md shadow-blue-200 transition-all hover:from-blue-600 hover:to-blue-700 active:scale-[0.98]">
            Crear turno
          </button>
        </div>
      </div>
    </div>
  )
}
