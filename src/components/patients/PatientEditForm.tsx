"use client"

import Link from "next/link"
import { useEffect, useState, type FormEvent } from "react"
import { ClinicPage } from "@/components/clinic/ClinicPrimitives"
import { ErrorState, FormField, LoadingState } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"
import { getClinicErrorMessage, getPatient, updatePatient, type Patient } from "@/lib/clinic"

export default function PatientEditForm({ patientId }: { patientId: string }) {
  const { user } = useSession()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const isOwner = user?.roles.includes("patient") && user.patientId === patientId

  useEffect(() => {
    let active = true
    void getPatient(patientId).then((result) => {
      if (active) setPatient(result)
    }).catch((requestError: unknown) => {
      if (active) setError(getClinicErrorMessage(requestError, "No se pudo cargar el perfil del paciente."))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [patientId])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isOwner) return
    setSubmitting(true)
    setError(null)
    setSaved(false)
    const form = new FormData(event.currentTarget)
    const text = (field: string) => String(form.get(field) ?? "").trim()
    const input = {
      ...(text("phone") ? { phone: text("phone") } : {}),
      ...(text("email") ? { email: text("email") } : {}),
      ...(text("address") ? { address: text("address") } : {}),
    }
    if (Object.keys(input).length === 0) {
      setError("Ingresá al menos un dato de contacto para guardar.")
      setSubmitting(false)
      return
    }

    try {
      setPatient(await updatePatient(patientId, input))
      setSaved(true)
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudieron guardar los cambios."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ClinicPage
      eyebrow="Pacientes"
      title="Editar datos de contacto"
      description="El contrato solo permite que cada paciente actualice sus propios datos de contacto."
    >
      {loading && <LoadingState label="Cargando perfil..." />}
      {error && <ErrorState description={error} />}
      {!loading && !error && !isOwner && (
        <ErrorState description="Solo el titular de este perfil puede actualizar teléfono, email y domicilio." />
      )}
      {!loading && patient && isOwner && (
        <form className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2" onSubmit={submit}>
          <p className="font-medium text-slate-900 sm:col-span-2">{patient.firstName} {patient.lastName}</p>
          <FormField id="phone" label="Teléfono" name="phone" type="tel" minLength={5} maxLength={20} defaultValue={patient.phone ?? ""} disabled={submitting} />
          <FormField id="email" label="Email" name="email" type="email" maxLength={254} defaultValue={patient.email ?? ""} disabled={submitting} />
          <div className="sm:col-span-2">
            <FormField id="address" label="Domicilio" name="address" maxLength={300} defaultValue={patient.address ?? ""} disabled={submitting} />
          </div>
          {saved && <p role="status" className="text-sm text-emerald-800 sm:col-span-2">Los datos se guardaron correctamente.</p>}
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" disabled={submitting} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {submitting ? "Guardando..." : "Guardar cambios"}
            </button>
            <Link href={`/patients/${encodeURIComponent(patientId)}`} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
              Volver
            </Link>
          </div>
        </form>
      )}
    </ClinicPage>
  )
}
