import type { Patient } from "@/data/mockPatients"
import type { ViewProps } from "@/types"

export default function PatientsView({ data, onAction }: ViewProps) {
  const patients = data?.patients as Patient[] | undefined

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Pacientes</h2>
          <p className="mt-1 text-sm text-slate-500">
            {patients ? `${patients.length} registrados en el consultorio` : "Listado completo del consultorio"}
          </p>
        </div>
        <button className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800">
          Nuevo paciente
        </button>
      </div>
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3.5 font-medium">Paciente</th>
              <th className="px-5 py-3.5 font-medium">Contacto</th>
              <th className="px-5 py-3.5 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {patients && patients.length > 0 ? (
              patients.map((p) => (
                <tr
                  key={p.id}
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-teal-50/40"
                  onClick={() => onAction?.({ view: "patient_detail", data: { patient: p } })}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-800">
                        {p.name.charAt(0)}
                      </span>
                      <div>
                        <p className="font-medium text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">{p.phone}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        p.status === "Activo"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-5 py-16 text-center" colSpan={3}>
                  <div className="mx-auto flex max-w-xs flex-col items-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-teal-700">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="9" cy="8" r="3" />
                        <path d="M4 19a5 5 0 0 1 10 0" />
                        <path d="M16 11h5M18.5 8.5v5" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-slate-600">No hay pacientes para mostrar</p>
                    <p className="mt-1 text-xs text-slate-400">Pedile al asistente el listado o usá el atajo de inicio.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
