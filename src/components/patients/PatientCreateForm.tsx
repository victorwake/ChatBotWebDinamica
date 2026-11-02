"use client"

import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ClinicPage } from "@/components/clinic/ClinicPrimitives"
import { ErrorState, FormField, Notification } from "@/components/ui/states"
import { createPatient, getClinicErrorMessage } from "@/lib/clinic"
import { useSession } from "@/contexts/SessionContext"
import { getInvitationErrorMessage, invitePatientRegistration } from "@/lib/session"

export default function PatientCreateForm() {
  const { user } = useSession()
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendInvitation, setSendInvitation] = useState(false)
  const [invitationAccepted, setInvitationAccepted] = useState(false)
  const canRegisterPatient = user?.roles.some((role) => ["administrative", "administrator"].includes(role))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const text = (field: string) => String(form.get(field) ?? "").trim()

    if (sendInvitation && !text("email")) {
      setError("Ingresá el email al que se enviará la invitación.")
      setSubmitting(false)
      return
    }

    const patient = {
        firstName: text("firstName"),
        lastName: text("lastName"),
        nationalId: text("nationalId"),
        birthDate: text("birthDate"),
        phone: text("phone"),
        ...(text("email") ? { email: text("email") } : {}),
        ...(text("address") ? { address: text("address") } : {}),
      }

    try {
      if (sendInvitation) {
        await invitePatientRegistration({
          patient: {
            ...patient,
            email: text("email"),
          },
        })
        setInvitationAccepted(true)
        return
      }

      const createdPatient = await createPatient(patient)
      router.push(`/patients/${encodeURIComponent(createdPatient.id)}`)
    } catch (requestError) {
      setError(sendInvitation
        ? getInvitationErrorMessage(requestError)
        : getClinicErrorMessage(requestError, "No se pudo registrar el paciente."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ClinicPage
      eyebrow="Pacientes"
      title="Registrar paciente"
      description="Podés crear una ficha o enviar una invitación para que el paciente active su propia cuenta."
    >
      {!canRegisterPatient && (
        <ErrorState description="Solo el personal administrativo puede registrar pacientes." />
      )}
      {error && <ErrorState description={error} />}
      {invitationAccepted ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Notification>
            Si los datos son válidos, se enviarán instrucciones al email indicado. No se asignó una contraseña al paciente.
          </Notification>
          <Link href="/patients" className="w-fit rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">
            Volver a pacientes
          </Link>
        </div>
      ) : canRegisterPatient && (
      <form className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2" onSubmit={submit}>
        <FormField id="firstName" label="Nombre" name="firstName" required maxLength={100} disabled={submitting} />
        <FormField id="lastName" label="Apellido" name="lastName" required maxLength={100} disabled={submitting} />
        <FormField id="nationalId" label="Documento" name="nationalId" required minLength={5} maxLength={20} disabled={submitting} />
        <FormField id="birthDate" label="Fecha de nacimiento" name="birthDate" type="date" required disabled={submitting} />
        <FormField id="phone" label="Teléfono" name="phone" type="tel" required minLength={5} maxLength={20} disabled={submitting} />
        <FormField id="email" label={sendInvitation ? "Email para la invitación" : "Email (opcional)"} name="email" type="email" maxLength={254} required={sendInvitation} disabled={submitting} />
        <div className="sm:col-span-2">
          <FormField id="address" label="Domicilio (opcional)" name="address" maxLength={300} disabled={submitting} />
        </div>
        <label className="flex items-start gap-3 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={sendInvitation}
            onChange={(event) => setSendInvitation(event.target.checked)}
            disabled={submitting}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
          />
          <span>Enviar invitación para que el paciente cree su contraseña y active la cuenta.</span>
        </label>
        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <button type="submit" disabled={submitting} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {submitting ? "Guardando..." : sendInvitation ? "Registrar e invitar" : "Registrar paciente"}
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
