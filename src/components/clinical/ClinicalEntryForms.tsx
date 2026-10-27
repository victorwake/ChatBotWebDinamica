"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import { ClinicCard } from "@/components/clinic/ClinicPrimitives"
import { ErrorState, FormField } from "@/components/ui/states"
import {
  addConsultationDiagnosis,
  addConsultationTreatment,
  createConsultationPrescription,
  getClinicErrorMessage,
  type ClinicalDiagnosisInput,
  type ClinicalPrescriptionInput,
  type ClinicalTreatmentInput,
  type DiagnosisStatus,
  type PrescriptionItemInput,
} from "@/lib/clinic"

const diagnosisStatuses: { value: DiagnosisStatus; label: string }[] = [
  { value: "activo", label: "Activo" },
  { value: "controlado", label: "Controlado" },
  { value: "resuelto", label: "Resuelto" },
  { value: "cronico", label: "Crónico" },
  { value: "en_remision", label: "En remisión" },
]

function todayInBuenosAires(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function text(data: FormData, name: string): string {
  return String(data.get(name) ?? "").trim()
}

function optionalNumber(data: FormData, name: string): number | undefined {
  const value = text(data, name)
  return value === "" ? undefined : Number(value)
}

function optionalText(data: FormData, name: string): string | undefined {
  return text(data, name) || undefined
}

export function DiagnosisForm({
  consultationId,
  onSaved,
}: {
  consultationId: string
  onSaved: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const code = optionalText(data, "code")
    const statusValue = text(data, "status")
    const status = diagnosisStatuses.find((item) => item.value === statusValue)?.value
    const notes = optionalText(data, "notes")
    const input: ClinicalDiagnosisInput = {
      name: text(data, "name"),
      diagnosisDate: text(data, "diagnosisDate"),
      primary: data.get("primary") === "on",
      ...(code ? { code } : {}),
      ...(status ? { status } : {}),
      ...(notes ? { notes } : {}),
    }

    setBusy(true)
    setError(null)
    try {
      await addConsultationDiagnosis(consultationId, input)
      form.reset()
      await onSaved()
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudo agregar el diagnóstico."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ClinicalEntryForm title="Agregar diagnóstico" error={error}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <FormField id="diagnosis-name" name="name" label="Diagnóstico" required maxLength={200} />
        <FormField id="diagnosis-code" name="code" label="Código (opcional)" maxLength={10} />
        <FormField id="diagnosis-date" name="diagnosisDate" label="Fecha" type="date" defaultValue={todayInBuenosAires()} required />
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Estado
          <select name="status" defaultValue="" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5">
            <option value="">Sin especificar</option>
            {diagnosisStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" name="primary" className="h-4 w-4 accent-teal-700" />
          Marcar como diagnóstico principal
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">
          Notas (opcional)
          <textarea name="notes" maxLength={5000} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <SubmitButton busy={busy} label="Agregar diagnóstico" />
      </form>
    </ClinicalEntryForm>
  )
}

export function TreatmentForm({
  consultationId,
  onSaved,
}: {
  consultationId: string
  onSaved: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const input: ClinicalTreatmentInput = {
      name: text(data, "name"),
      startDate: text(data, "startDate"),
      active: data.get("active") === "on",
      ...(optionalText(data, "description") ? { description: optionalText(data, "description") } : {}),
      ...(optionalText(data, "dose") ? { dose: optionalText(data, "dose") } : {}),
      ...(optionalText(data, "frequency") ? { frequency: optionalText(data, "frequency") } : {}),
      ...(optionalText(data, "route") ? { route: optionalText(data, "route") } : {}),
      ...(optionalNumber(data, "durationDays") !== undefined ? { durationDays: optionalNumber(data, "durationDays") } : {}),
      ...(optionalText(data, "endDate") ? { endDate: optionalText(data, "endDate") } : {}),
    }

    setBusy(true)
    setError(null)
    try {
      await addConsultationTreatment(consultationId, input)
      form.reset()
      await onSaved()
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudo registrar el tratamiento."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ClinicalEntryForm title="Registrar tratamiento" error={error}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <FormField id="treatment-name" name="name" label="Tratamiento" required maxLength={200} />
        <FormField id="treatment-dose" name="dose" label="Dosis (opcional)" maxLength={100} />
        <FormField id="treatment-frequency" name="frequency" label="Frecuencia (opcional)" maxLength={100} />
        <FormField id="treatment-route" name="route" label="Vía (opcional)" maxLength={50} />
        <FormField id="treatment-duration" name="durationDays" label="Duración en días (opcional)" type="number" min={1} max={3650} />
        <FormField id="treatment-start" name="startDate" label="Fecha de inicio" type="date" defaultValue={todayInBuenosAires()} required />
        <FormField id="treatment-end" name="endDate" label="Fecha de fin (opcional)" type="date" />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="active" defaultChecked className="h-4 w-4 accent-teal-700" />
          Tratamiento activo
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">
          Descripción (opcional)
          <textarea name="description" maxLength={5000} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <SubmitButton busy={busy} label="Registrar tratamiento" />
      </form>
    </ClinicalEntryForm>
  )
}

const blankItem = (): PrescriptionItemInput => ({
  medicationName: "",
  dose: "",
  frequency: "",
})

export function PrescriptionForm({
  consultationId,
  onSaved,
}: {
  consultationId: string
  onSaved: () => Promise<void>
}) {
  const [items, setItems] = useState<PrescriptionItemInput[]>([blankItem()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateItem(index: number, field: keyof PrescriptionItemInput, value: string) {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      if (field === "quantityUnits") {
        return { ...item, quantityUnits: value === "" ? undefined : Number(value) }
      }
      return { ...item, [field]: value }
    }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const input: ClinicalPrescriptionInput = {
      validUntil: text(data, "validUntil"),
      ...(optionalText(data, "generalInstructions")
        ? { generalInstructions: optionalText(data, "generalInstructions") }
        : {}),
      items: items.map((item) => ({
        medicationName: item.medicationName.trim(),
        dose: item.dose.trim(),
        frequency: item.frequency.trim(),
        ...(item.concentration?.trim() ? { concentration: item.concentration.trim() } : {}),
        ...(item.duration?.trim() ? { duration: item.duration.trim() } : {}),
        ...(item.quantityUnits !== undefined ? { quantityUnits: item.quantityUnits } : {}),
        ...(item.instructions?.trim() ? { instructions: item.instructions.trim() } : {}),
      })),
    }

    setBusy(true)
    setError(null)
    try {
      await createConsultationPrescription(consultationId, input)
      form.reset()
      setItems([blankItem()])
      await onSaved()
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudo emitir la receta."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ClinicalEntryForm title="Emitir receta" error={error}>
      <form className="space-y-5" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="prescription-valid-until" name="validUntil" label="Válida hasta" type="date" min={todayInBuenosAires()} required />
          <label className="text-sm font-medium text-slate-700">
            Indicaciones generales (opcional)
            <textarea name="generalInstructions" maxLength={5000} rows={2} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
          </label>
        </div>
        <div className="space-y-4">
          {items.map((item, index) => (
            <fieldset key={index} className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
              <legend className="px-2 text-sm font-semibold text-slate-700">Medicamento {index + 1}</legend>
              <FormField id={`medication-name-${index}`} label="Medicamento" value={item.medicationName} onChange={(event) => updateItem(index, "medicationName", event.target.value)} required maxLength={200} />
              <FormField id={`medication-concentration-${index}`} label="Concentración (opcional)" value={item.concentration ?? ""} onChange={(event) => updateItem(index, "concentration", event.target.value)} maxLength={50} />
              <FormField id={`medication-dose-${index}`} label="Dosis" value={item.dose} onChange={(event) => updateItem(index, "dose", event.target.value)} required maxLength={100} />
              <FormField id={`medication-frequency-${index}`} label="Frecuencia" value={item.frequency} onChange={(event) => updateItem(index, "frequency", event.target.value)} required maxLength={100} />
              <FormField id={`medication-duration-${index}`} label="Duración (opcional)" value={item.duration ?? ""} onChange={(event) => updateItem(index, "duration", event.target.value)} maxLength={50} />
              <FormField id={`medication-quantity-${index}`} label="Cantidad de unidades (opcional)" type="number" min={1} max={100000} value={item.quantityUnits ?? ""} onChange={(event) => updateItem(index, "quantityUnits", event.target.value)} />
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                Indicaciones para este medicamento (opcional)
                <textarea value={item.instructions ?? ""} onChange={(event) => updateItem(index, "instructions", event.target.value)} maxLength={1000} rows={2} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              {items.length > 1 && (
                <button type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="justify-self-start text-sm font-medium text-rose-800 underline">
                  Quitar medicamento
                </button>
              )}
            </fieldset>
          ))}
          <button type="button" disabled={items.length >= 30} onClick={() => setItems((current) => [...current, blankItem()])} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
            Agregar medicamento
          </button>
        </div>
        <SubmitButton busy={busy} label="Emitir receta" />
      </form>
    </ClinicalEntryForm>
  )
}

function ClinicalEntryForm({
  title,
  error,
  children,
}: {
  title: string
  error: string | null
  children: ReactNode
}) {
  return (
    <ClinicCard>
      <h3 className="mb-4 text-base font-semibold text-slate-900">{title}</h3>
      {error && <div className="mb-4"><ErrorState description={error} /></div>}
      {children}
    </ClinicCard>
  )
}

function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button type="submit" disabled={busy} className="justify-self-start rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
      {busy ? "Guardando..." : label}
    </button>
  )
}
