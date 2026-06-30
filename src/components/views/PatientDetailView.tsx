import type { Patient } from "@/data/mockPatients"

type FieldProps = { label: string; value: string; highlight?: string }

function Field({ label, value, highlight }: FieldProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="shrink-0 text-xs text-slate-400">{label}</span>
      <span className={`text-right text-sm font-medium ${highlight === value ? "text-emerald-600" : "text-slate-700"}`}>
        {value}
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-5">
        {children}
      </div>
    </div>
  )
}

export default function PatientDetailView({ data }: { data?: Record<string, unknown> }) {
  const patient = data?.patient as Patient | undefined

  if (!patient) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-2xl text-slate-400">
            👤
          </div>
          <p className="text-sm text-slate-400">Seleccioná un paciente</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-lg text-white shadow-md shadow-blue-200">
          {patient.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-slate-800">{patient.name}</h2>
          <div className="mt-0.5 flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-600">
              ID {patient.id}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                patient.status === "Activo"
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {patient.status}
            </span>
          </div>
        </div>
      </div>

      <Section title="Datos personales">
        <Field label="Email" value={patient.email} />
        <Field label="Teléfono" value={patient.phone} />
        <Field label="Edad" value={`${patient.age} años`} />
        <Field label="Fecha de nac." value={patient.birthDate} />
        <Field label="Sexo" value={patient.gender} />
        <Field label="Grupo sanguíneo" value={patient.bloodType} />
        <Field label="Dirección" value={patient.address} />
        <Field label="Obra social" value={patient.insurance} />
        <Field label="Contacto emergencia" value={patient.emergencyContact} />
      </Section>

      <Section title="Información clínica">
        <Field label="Diagnóstico" value={patient.diagnosis} />
        <Field label="Medicación" value={patient.medications} />
        <Field label="Alergias" value={patient.allergies} />
        <Field label="Última consulta" value={patient.lastVisit} />
      </Section>
    </div>
  )
}
