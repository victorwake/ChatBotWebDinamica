"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ClinicCard, ClinicPage, formatDateTime } from "@/components/clinic/ClinicPrimitives"
import { EmptyState, ErrorState, FormField, LoadingState } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"
import { ApiError } from "@/lib/api"
import {
  createConsultation,
  getAppointment,
  getClinicErrorMessage,
  type Appointment,
  type ClinicalConsultationInput,
  type ConsultationType,
} from "@/lib/clinic"

const consultationTypes: { value: ConsultationType; label: string }[] = [
  { value: "programada", label: "Programada" },
  { value: "espontanea", label: "Espontánea" },
  { value: "urgencia", label: "Urgencia" },
  { value: "control", label: "Control" },
]

export default function ClinicalConsultationCreateForm({ appointmentId }: { appointmentId?: string }) {
  const router = useRouter()
  const { user } = useSession()
  const canCreate = Boolean(user?.roles.includes("doctor") && !user.roles.includes("patient"))
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [existingRecordConflict, setExistingRecordConflict] = useState(false)

  const loadAppointment = useCallback(async () => {
    if (!canCreate || !appointmentId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    setAppointment(null)
    try {
      setAppointment(await getAppointment(appointmentId))
    } catch (requestError) {
      setLoadError(getClinicErrorMessage(requestError, "No se pudo cargar el turno vinculado."))
    } finally {
      setLoading(false)
    }
  }, [appointmentId, canCreate])

  useEffect(() => { void Promise.resolve().then(loadAppointment) }, [loadAppointment])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    void Promise.resolve().then(() => setNow(Date.now()))
    return () => window.clearInterval(timer)
  }, [])

  const started = Boolean(appointment && now > 0 && new Date(appointment.startsAt).getTime() <= now)
  const blockedStatus = appointment?.status === "cancelled" || appointment?.status === "no_show"

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!appointmentId || !appointment || new Date(appointment.startsAt).getTime() > Date.now() || blockedStatus) return
    const form = new FormData(event.currentTarget)
    const input: ClinicalConsultationInput = {
      appointmentId,
      type: String(form.get("type")) as ConsultationType,
      ...(optionalText(form, "reason") ? { reason: optionalText(form, "reason") } : {}),
      ...(optionalText(form, "primaryDiagnosis") ? { primaryDiagnosis: optionalText(form, "primaryDiagnosis") } : {}),
      ...(optionalText(form, "secondaryDiagnosis") ? { secondaryDiagnosis: optionalText(form, "secondaryDiagnosis") } : {}),
      ...(optionalText(form, "observations") ? { observations: optionalText(form, "observations") } : {}),
      ...optionalClinicalMeasurements(form),
    }

    setBusy(true)
    setSubmitError(null)
    setExistingRecordConflict(false)
    try {
      const created = await createConsultation(input)
      router.push(`/consultations/${encodeURIComponent(created.id)}`)
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === "CONSULTATION_ALREADY_EXISTS") {
        setExistingRecordConflict(true)
      }
      setSubmitError(getClinicErrorMessage(requestError, "No se pudo registrar la atención."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ClinicPage
      eyebrow="Atención clínica"
      title="Registrar atención"
      description="La atención se vincula al turno seleccionado. El servidor valida que el turno corresponda a tu perfil y que pueda completarse."
    >
      {!canCreate && <EmptyState title="Acceso no disponible" description="Solo el profesional tratante puede registrar una atención." />}
      {canCreate && !appointmentId && (
        <EmptyState
          title="Falta seleccionar un turno"
          description="Iniciá el registro desde el detalle de un turno pasado o en curso."
          action={<Link href="/appointments" className="font-medium text-teal-800 underline">Ir a turnos</Link>}
        />
      )}
      {canCreate && appointmentId && loading && <LoadingState label="Verificando turno..." />}
      {canCreate && appointmentId && loadError && (
        <ErrorState description={loadError} onRetry={() => void loadAppointment()} />
      )}
      {existingRecordConflict && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          El servidor informa que el turno ya tiene un registro o cambió de estado. Revisá las atenciones disponibles antes de volver a intentar.
          {" "}<Link href="/consultations" className="font-semibold underline">Ir a atenciones</Link>
        </p>
      )}
      {canCreate && appointment && !loading && (
        <>
          <ClinicCard>
            <h2 className="text-lg font-semibold text-slate-900">Turno asociado</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Detail label="Paciente" value={appointment.patient.displayName} />
              <Detail label="Profesional" value={appointment.doctor.displayName} />
              <Detail label="Especialidad" value={appointment.specialty.name} />
              <Detail label="Fecha y hora" value={formatDateTime(appointment.startsAt)} />
            </dl>
          </ClinicCard>

          {!started && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">El registro se habilitará cuando comience el turno.</p>}
          {blockedStatus && <p role="status" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">No se puede registrar una atención para un turno cancelado o ausente.</p>}
          {started && !blockedStatus && (
            <ClinicCard>
              <form className="grid gap-5 sm:grid-cols-2" onSubmit={submit}>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                  Tipo de atención
                  <select name="type" required defaultValue="programada" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                    {consultationTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </label>
                <FormField id="consultation-reason" name="reason" label="Motivo (opcional)" maxLength={5000} />
                <FormField id="consultation-primary-diagnosis" name="primaryDiagnosis" label="Diagnóstico principal (opcional)" maxLength={5000} />
                <FormField id="consultation-secondary-diagnosis" name="secondaryDiagnosis" label="Diagnóstico secundario (opcional)" maxLength={5000} />
                <FormField id="systolic-pressure" name="systolicPressure" label="Presión sistólica (mmHg)" type="number" min={40} max={300} />
                <FormField id="diastolic-pressure" name="diastolicPressure" label="Presión diastólica (mmHg)" type="number" min={20} max={200} />
                <FormField id="consultation-weight" name="weight" label="Peso (kg)" type="number" min={0.01} max={500} step="any" />
                <FormField id="consultation-height" name="height" label="Altura (m)" type="number" min={0.01} max={3} step="any" />
                <FormField id="consultation-temperature" name="temperature" label="Temperatura (°C)" type="number" min={25} max={45} step="any" />
                <FormField id="consultation-heart-rate" name="heartRate" label="Frecuencia cardíaca (lpm)" type="number" min={20} max={300} />
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Observaciones
                  <textarea name="observations" maxLength={10000} rows={5} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                {submitError && <div className="sm:col-span-2"><ErrorState description={submitError} /></div>}
                <button type="submit" disabled={busy} className="justify-self-start rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? "Registrando..." : "Registrar atención"}
                </button>
              </form>
            </ClinicCard>
          )}
        </>
      )}
    </ClinicPage>
  )
}

function optionalText(form: FormData, name: string): string | undefined {
  const value = String(form.get(name) ?? "").trim()
  return value || undefined
}

function optionalClinicalMeasurements(form: FormData): Pick<
  ClinicalConsultationInput,
  "systolicPressure" | "diastolicPressure" | "weight" | "height" | "temperature" | "heartRate"
> {
  const number = (name: keyof Pick<
    ClinicalConsultationInput,
    "systolicPressure" | "diastolicPressure" | "weight" | "height" | "temperature" | "heartRate"
  >) => {
    const value = String(form.get(name) ?? "").trim()
    return value ? Number(value) : undefined
  }
  const systolicPressure = number("systolicPressure")
  const diastolicPressure = number("diastolicPressure")
  const weight = number("weight")
  const height = number("height")
  const temperature = number("temperature")
  const heartRate = number("heartRate")

  return {
    ...(systolicPressure !== undefined ? { systolicPressure } : {}),
    ...(diastolicPressure !== undefined ? { diastolicPressure } : {}),
    ...(weight !== undefined ? { weight } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(heartRate !== undefined ? { heartRate } : {}),
  }
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value}</dd>
    </div>
  )
}
