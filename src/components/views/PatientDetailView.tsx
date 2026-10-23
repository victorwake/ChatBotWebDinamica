import type { Patient } from "@/data/mockPatients"
import type { ViewProps } from "@/types"

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-xs text-slate-400">{label}</span>
      <span className="text-right text-sm font-medium text-slate-700">{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  )
}

export default function PatientDetailView({ data }: ViewProps) {
  const patient = data?.patient as Patient | undefined

  if (!patient) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-teal-700">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="8" r="3" />
              <path d="M5 20a7 7 0 0 1 14 0" />
            </svg>
          </div>
          <p className="text-sm text-slate-500">Seleccioná un paciente para ver la ficha</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-700 text-xl font-semibold text-white">
          {patient.name.charAt(0)}
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-900">{patient.name}</h2>
        <p className="mt-1 text-sm text-slate-500">{patient.email}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
            ID {patient.id}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
              patient.status === "Activo"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {patient.status}
          </span>
        </div>
        <dl className="mt-6 space-y-3 text-sm">
          <div>
            <dt className="text-xs text-slate-400">Teléfono</dt>
            <dd className="font-medium text-slate-700">{patient.phone}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Obra social</dt>
            <dd className="font-medium text-slate-700">{patient.insurance}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Última consulta</dt>
            <dd className="font-medium text-slate-700">{patient.lastVisit}</dd>
          </div>
        </dl>
      </aside>

      <div className="flex flex-col gap-4">
        <Section title="Datos personales">
          <Field label="Edad" value={`${patient.age} años`} />
          <Field label="Fecha de nac." value={patient.birthDate} />
          <Field label="Sexo" value={patient.gender} />
          <Field label="Grupo sanguíneo" value={patient.bloodType} />
          <Field label="Dirección" value={patient.address} />
          <Field label="Contacto emergencia" value={patient.emergencyContact} />
        </Section>
        <Section title="Información clínica">
          <Field label="Diagnóstico" value={patient.diagnosis} />
          <Field label="Medicación" value={patient.medications} />
          <Field label="Alergias" value={patient.allergies} />
        </Section>
      </div>
    </div>
  )
}
