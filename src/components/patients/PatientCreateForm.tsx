"use client"

import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ClinicPage } from "@/components/clinic/ClinicPrimitives"
import { ErrorState, FormField, Notification } from "@/components/ui/states"
import { createPatient, getClinicErrorMessage } from "@/lib/clinic"
import { useSession } from "@/contexts/SessionContext"

export default function PatientCreateForm() {
  const { user } = useSession()
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const text = (field: string) => String(form.get(field) ?? "").trim()

    try {
      const patient = await createPatient({
        firstName: text("firstName"),
        lastName: text("lastName"),
        nationalId: text("nationalId"),
        birthDate: text("birthDate"),
        phone: text("phone"),
        ...(text("email") ? { email: text("email") } : {}),
        ...(text("address") ? { address: text("address") } : {}),
      })
      router.push(`/patients/${encodeURIComponent(patient.id)}`)
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudo registrar el paciente."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ClinicPage
      eyebrow="Pacientes"
      title="Registrar paciente"
      description="El registro crea un perfil de paciente; no crea una cuenta de acceso."
    >
      {!user?.roles.includes("administrative") && (
        <ErrorState description="Solo el personal administrativo puede registrar pacientes." />
      )}
      {error && <ErrorState description={error} />}
      {user?.roles.includes("administrative") && (
      <form className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2" onSubmit={submit}>
        <FormField id="firstName" label="Nombre" name="firstName" required maxLength={100} disabled={submitting} />
        <FormField id="lastName" label="Apellido" name="lastName" required maxLength={100} disabled={submitting} />
        <FormField id="nationalId" label="Documento" name="nationalId" required minLength={5} maxLength={20} disabled={submitting} />
        <FormField id="birthDate" label="Fecha de nacimiento" name="birthDate" type="date" required disabled={submitting} />
        <FormField id="phone" label="Teléfono" name="phone" type="tel" required minLength={5} maxLength={20} disabled={submitting} />
        <FormField id="email" label="Email (opcional)" name="email" type="email" maxLength={254} disabled={submitting} />
        <div className="sm:col-span-2">
          <FormField id="address" label="Domicilio (opcional)" name="address" maxLength={300} disabled={submitting} />
        </div>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button type="submit" disabled={submitting} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {submitting ? "Guardando..." : "Registrar paciente"}
          </button>
          <Link href="/patients" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
            Cancelar
          </Link>
        </div>
        {submitting && <Notification>Enviando el registro al servidor…</Notification>}
      </form>
      )}
    </ClinicPage>
  )
}
