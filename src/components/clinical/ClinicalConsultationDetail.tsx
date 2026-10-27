"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { ClinicCard, ClinicPage, formatDate, formatDateTime } from "@/components/clinic/ClinicPrimitives"
import { DiagnosisForm, PrescriptionForm, TreatmentForm } from "@/components/clinical/ClinicalEntryForms"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"
import {
  getClinicErrorMessage,
  getConsultation,
  type ClinicalConsultationDetail as ClinicalConsultationRecord,
} from "@/lib/clinic"

export default function ClinicalConsultationDetail({ consultationId }: { consultationId: string }) {
  const { user } = useSession()
  const allowed = Boolean(user?.roles.includes("patient") || user?.roles.includes("doctor"))
  const canManage = Boolean(user?.roles.includes("doctor") && !user.roles.includes("patient"))
  const [consultation, setConsultation] = useState<ClinicalConsultationRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!allowed) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setConsultation(null)
    try {
      setConsultation(await getConsultation(consultationId))
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudo cargar la atención clínica."))
    } finally {
      setLoading(false)
    }
  }, [allowed, consultationId])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const refreshAfterSave = useCallback(async () => {
    setError(null)
    try {
      setConsultation(await getConsultation(consultationId))
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "El registro se guardó, pero no se pudo actualizar la vista."))
    }
  }, [consultationId])

  return (
    <ClinicPage
      eyebrow="Atención clínica"
      title="Detalle de atención"
      description="La información clínica se consulta exclusivamente desde la API para la sesión autorizada."
    >
      {!allowed && <EmptyState title="Acceso no disponible" description="Este perfil no tiene acceso a información clínica." />}
      {allowed && loading && <LoadingState label="Cargando atención clínica..." />}
      {allowed && error && <ErrorState description={error} onRetry={() => void load()} />}
      {allowed && !loading && consultation && (
        <>
          <ClinicCard>
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{formatDateTime(consultation.consultationDate)}</h2>
                <p className="mt-1 text-sm text-slate-600">{consultation.specialty.name} · {consultation.doctor.displayName}</p>
                <p className="mt-1 text-sm text-slate-600">Paciente: {consultation.patient.displayName}</p>
              </div>
              {consultation.type && <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-900">{consultationTypeLabel(consultation.type)}</span>}
            </header>
            <dl className="grid gap-5 py-5 sm:grid-cols-2">
              <Detail label="Motivo" value={consultation.reason} />
              <Detail label="Diagnóstico principal" value={consultation.primaryDiagnosis} />
              <Detail label="Diagnóstico secundario" value={consultation.secondaryDiagnosis} />
              <Detail label="Observaciones" value={consultation.observations} />
              <Detail label="Presión arterial" value={consultation.systolicPressure !== undefined && consultation.diastolicPressure !== undefined ? `${consultation.systolicPressure}/${consultation.diastolicPressure} mmHg` : undefined} />
              <Detail label="Peso" value={consultation.weight !== undefined ? `${consultation.weight} kg` : undefined} />
              <Detail label="Altura" value={consultation.height !== undefined ? `${consultation.height} m` : undefined} />
              <Detail label="Temperatura" value={consultation.temperature !== undefined ? `${consultation.temperature} °C` : undefined} />
              <Detail label="Frecuencia cardíaca" value={consultation.heartRate !== undefined ? `${consultation.heartRate} lpm` : undefined} />
            </dl>
            <nav aria-label="Navegación clínica" className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
              <Link href="/consultations" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
                Volver a atenciones
              </Link>
              <Link href={`/patients/${encodeURIComponent(consultation.patient.id)}/medical-history`} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-teal-800">
                Ver historial del paciente
              </Link>
            </nav>
          </ClinicCard>

          <ClinicCard>
            <h2 className="text-lg font-semibold text-slate-900">Diagnósticos</h2>
            {consultation.diagnoses.length === 0
              ? <p className="mt-3 text-sm text-slate-600">Sin diagnósticos asociados.</p>
              : <ul className="mt-4 divide-y divide-slate-100">{consultation.diagnoses.map((diagnosis) => (
                  <li key={diagnosis.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="font-medium text-slate-900">{diagnosis.name}{diagnosis.primary ? " · Principal" : ""}</p>
                    <p className="mt-1 text-sm text-slate-600">{diagnosis.status ? diagnosisStatusLabel(diagnosis.status) : "Estado sin especificar"} · {formatDate(diagnosis.diagnosisDate)}{diagnosis.code ? ` · ${diagnosis.code}` : ""}</p>
                    {diagnosis.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{diagnosis.notes}</p>}
                  </li>
                ))}</ul>}
          </ClinicCard>

          <ClinicCard>
            <h2 className="text-lg font-semibold text-slate-900">Tratamientos</h2>
            {consultation.treatments.length === 0
              ? <p className="mt-3 text-sm text-slate-600">Sin tratamientos registrados.</p>
              : <ul className="mt-4 divide-y divide-slate-100">{consultation.treatments.map((treatment) => (
                  <li key={treatment.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="font-medium text-slate-900">{treatment.name} · {treatment.active ? "Activo" : "Inactivo"}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatDate(treatment.startDate)}{treatment.endDate ? ` – ${formatDate(treatment.endDate)}` : ""}
                      {treatment.durationDays ? ` · ${treatment.durationDays} días` : ""}
                    </p>
                    {(treatment.dose || treatment.frequency || treatment.route) && (
                      <p className="mt-1 text-sm text-slate-700">{[treatment.dose, treatment.frequency, treatment.route].filter(Boolean).join(" · ")}</p>
                    )}
                    {treatment.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{treatment.description}</p>}
                  </li>
                ))}</ul>}
          </ClinicCard>

          <ClinicCard>
            <h2 className="text-lg font-semibold text-slate-900">Recetas</h2>
            {consultation.prescriptions.length === 0
              ? <p className="mt-3 text-sm text-slate-600">Sin recetas emitidas.</p>
              : <div className="mt-4 space-y-4">{consultation.prescriptions.map((prescription) => (
                  <section key={prescription.id} className="rounded-xl border border-slate-200 p-4">
                    <h3 className="font-medium text-slate-900">Receta {prescription.number}</h3>
                    <p className="mt-1 text-sm text-slate-600">Emitida {formatDate(prescription.issueDate)} · Válida hasta {formatDate(prescription.validUntil)}</p>
                    {prescription.generalInstructions && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{prescription.generalInstructions}</p>}
                    <ul className="mt-3 space-y-2">{prescription.items.map((item) => (
                      <li key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                        <p className="font-medium text-slate-900">{item.medicationName}{item.concentration ? ` · ${item.concentration}` : ""}</p>
                        <p className="mt-1 text-slate-700">{item.dose} · {item.frequency}{item.duration ? ` · ${item.duration}` : ""}</p>
                        {item.quantityUnits !== undefined && <p className="mt-1 text-slate-600">Cantidad: {item.quantityUnits}</p>}
                        {item.instructions && <p className="mt-1 whitespace-pre-wrap text-slate-600">{item.instructions}</p>}
                      </li>
                    ))}</ul>
                  </section>
                ))}</div>}
          </ClinicCard>

          {canManage && (
            <section aria-label="Agregar información clínica" className="space-y-5">
              <h2 className="text-xl font-semibold text-slate-900">Actualizar registro clínico</h2>
              <DiagnosisForm consultationId={consultation.id} onSaved={refreshAfterSave} />
              <TreatmentForm consultationId={consultation.id} onSaved={refreshAfterSave} />
              <PrescriptionForm consultationId={consultation.id} onSaved={refreshAfterSave} />
            </section>
          )}
        </>
      )}
    </ClinicPage>
  )
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{value || "—"}</dd>
    </div>
  )
}

function consultationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    programada: "Programada",
    espontanea: "Espontánea",
    urgencia: "Urgencia",
    control: "Control",
  }
  return labels[type] ?? "Atención"
}

function diagnosisStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    activo: "Activo",
    controlado: "Controlado",
    resuelto: "Resuelto",
    cronico: "Crónico",
    en_remision: "En remisión",
  }
  return labels[status] ?? "Estado desconocido"
}
