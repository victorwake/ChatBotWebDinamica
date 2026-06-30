import type { Patient } from "@/data/mockPatients"

export default function PatientsView({ data }: { data?: Record<string, unknown> }) {
  const patients = data?.patients as Patient[] | undefined

  return (
    <div className="flex flex-1 flex-col p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Pacientes</h2>
          <p className="text-xs text-slate-400">
            {patients ? `${patients.length} registrados` : "Listado completo del consultorio"}
          </p>
        </div>
        <button className="rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-xs font-medium text-white shadow-md shadow-blue-200 transition-all hover:from-blue-600 hover:to-blue-700 active:scale-95">
          + Nuevo
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-5 py-3.5 font-medium text-slate-500">Nombre</th>
              <th className="px-5 py-3.5 font-medium text-slate-500">Email</th>
              <th className="px-5 py-3.5 font-medium text-slate-500">Teléfono</th>
              <th className="px-5 py-3.5 font-medium text-slate-500">Estado</th>
            </tr>
          </thead>
          <tbody>
            {patients && patients.length > 0 ? (
              patients.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-3.5 font-medium text-slate-800">{p.name}</td>
                  <td className="px-5 py-3.5 text-slate-500">{p.email}</td>
                  <td className="px-5 py-3.5 text-slate-500">{p.phone}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        p.status === "Activo"
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-zinc-100 text-zinc-400"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr className="border-t border-slate-100">
                <td className="px-5 py-10 text-center text-sm text-slate-300" colSpan={4}>
                  <span className="mb-1 block text-2xl">📋</span>
                  No hay pacientes registrados todavía
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
