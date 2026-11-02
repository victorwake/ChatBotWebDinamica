"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ClinicPage } from "@/components/clinic/ClinicPrimitives"
import { ErrorState, FormField, LoadingState, Notification } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"
import { getPatient, type Patient } from "@/lib/clinic"
import { getInvitationErrorMessage, invitePatientRegistration } from "@/lib/session"

export default function PatientInvitationForm({ patientId }: { patientId: string }) {
  const { user } = useSession()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canInvite = user?.roles.some((role) => ["administrative", "administrator"].includes(role))

  const loadPatient = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPatient(await getPatient(patientId))
    } catch (requestError) {
      setError(getInvitationErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => { void Promise.resolve().then(loadPatient) }, [loadPatient])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!patient?.email || !confirmed || busy) return

    setBusy(true)
    setError(null)
    try {
      await invitePatientRegistration({
        patientId,
        email: patient.email,
        identityConfirmed: true,
      })
      setSent(true)
    } catch (requestError) {
      setError(getInvitationErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ClinicPage
      eyebrow="Pacientes"
      title="Invitar a activar una cuenta"
      description="La invitación se envía al email que ya figura en la ficha. El paciente define su contraseña."
    >
      {!canInvite && <ErrorState description="Solo el personal administrativo puede enviar invitaciones." />}
      {error && <ErrorState description={error} onRetry={() => void loadPatient()} />}
      {loading && <LoadingState label="Cargando ficha del paciente..." />}
      {!loading && canInvite && patient && (
        sent ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <Notification>
              Si los datos son válidos, se enviarán instrucciones al email indicado. No se asignó una contraseña al paciente.
            </Notification>
            <Link href={`/patients/${encodeURIComponent(patientId)}`} className="w-fit rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">
              Volver a la ficha
            </Link>
          </div>
        ) : (
          <form className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={submit}>
            <p className="text-sm text-slate-700">
              Ficha: <strong>{patient.firstName} {patient.lastName}</strong>
            </p>
            {patient.email ? (
              <FormField
                id="invitation-email"
                label="Email de contacto"
                type="email"
                value={patient.email}
                readOnly
                disabled={busy}
                hint="No se puede cambiar el email desde el flujo de invitación."
              />
            ) : (
              <ErrorState description="La ficha no tiene un email de contacto. Actualizá el dato antes de enviar una invitación." />
            )}
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                disabled={busy || !patient.email}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
              />
              <span>
                Confirmo que verifiqué la identidad del titular y su acceso a este email mediante el proceso operativo aprobado.
              </span>
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={busy || !patient.email || !confirmed}
                className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Enviando..." : "Enviar invitación"}
              </button>
              <Link href={`/patients/${encodeURIComponent(patientId)}`} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
                Cancelar
              </Link>
            </div>
          </form>
        )
      )}
    </ClinicPage>
  )
}
