export default function WelcomeView(_props: { data?: Record<string, unknown> }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6">
      <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-4xl text-white shadow-lg shadow-blue-200">
        🏥
      </div>
      <h1 className="text-2xl font-bold text-slate-800">Sistema Médico</h1>
      <p className="max-w-sm text-center text-sm leading-relaxed text-slate-500">
        Gestioná pacientes, turnos e informes médicos desde el asistente virtual.
      </p>
      <div className="mt-2 flex flex-col gap-2 text-sm text-slate-400">
        <span className="flex items-center gap-2"><span className="text-blue-500">→</span> Escribí <strong className="text-slate-700">login</strong> para iniciar sesión</span>
        <span className="flex items-center gap-2"><span className="text-blue-500">→</span> Escribí <strong className="text-slate-700">pacientes</strong> para ver el listado</span>
        <span className="flex items-center gap-2"><span className="text-blue-500">→</span> Escribí <strong className="text-slate-700">turno</strong> para agendar una cita</span>
      </div>
    </div>
  )
}
