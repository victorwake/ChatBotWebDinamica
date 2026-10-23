import type { ViewProps } from "@/types"

export default function LoginView(_props: ViewProps) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900">Acceso al sistema</h2>
          <p className="mt-1 text-sm text-slate-500">Ingresá tus credenciales para continuar</p>
        </div>
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Usuario</span>
            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
              placeholder="usuario@consultorio.com"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600">Contraseña</span>
            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
              placeholder="••••••••"
              type="password"
            />
          </label>
          <button className="mt-2 rounded-xl bg-teal-700 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800 active:scale-[0.99]">
            Ingresar
          </button>
        </div>
      </div>
    </div>
  )
}
