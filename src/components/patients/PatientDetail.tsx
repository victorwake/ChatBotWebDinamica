"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { ClinicCard, ClinicPage, formatDate } from "@/components/clinic/ClinicPrimitives"
import { EmptyState, ErrorState, FormField, LoadingState } from "@/components/ui/states"
import { useSession } from "@/contexts/SessionContext"
import { ApiError } from "@/lib/api"
import {
  addPatientCoverage,
  getClinicErrorMessage,
  getPatient,
  listPatientCoverages,
  updatePatientCoverage,
  type Patient,
  type PatientCoverage,
  type PatientCoverageInput,
} from "@/lib/clinic"

function coverageInput(form: FormData): PatientCoverageInput {
  const text = (field: string) => String(form.get(field) ?? "").trim()
  const providerId = text("providerId")
  const memberNumber = text("memberNumber")
  const validFrom = text("validFrom")
  if (!/^\d+$/.test(providerId)) throw new Error("Ingresá el ID numérico del prestador.")
  if (!memberNumber || !validFrom) throw new Error("Completá prestador, número de afiliado y vigencia desde.")
  const relationship = text("relationship")
  return {
    providerId,
    memberNumber,
    validFrom,
    primary: form.get("primary") === "on",
    active: form.get("active") === "on",
    ...(relationship ? { relationship: relationship as PatientCoverageInput["relationship"] } : {}),
    ...(text("holderNationalId") ? { holderNationalId: text("holderNationalId") } : {}),
    ...(text("holderRelationship") ? { holderRelationship: text("holderRelationship") } : {}),
    ...(text("validUntil") ? { validUntil: text("validUntil") } : {}),
  }
}

export default function PatientDetail({ patientId }: { patientId: string }) {
  const { user } = useSession()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [coverages, setCoverages] = useState<PatientCoverage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coverageError, setCoverageError] = useState<string | null>(null)
  const [coverageBusy, setCoverageBusy] = useState(false)
  const [editingCoverage, setEditingCoverage] = useState<PatientCoverage | null>(null)
  const canEditOwnProfile = user?.roles.includes("patient") && user.patientId === patientId
  const canManageCoverage = canEditOwnProfile || user?.roles.includes("administrative")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [patientResult, coverageResult] = await Promise.all([
        getPatient(patientId),
        listPatientCoverages(patientId),
      ])
      setPatient(patientResult)
      setCoverages(coverageResult)
    } catch (requestError) {
      setError(getClinicErrorMessage(requestError, "No se pudo cargar el perfil del paciente."))
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  async function submitCoverage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCoverageBusy(true)
    setCoverageError(null)
    let input: PatientCoverageInput
    try {
      input = coverageInput(new FormData(event.currentTarget))
    } catch (validationError) {
      setCoverageError(validationError instanceof Error ? validationError.message : "Revisá los datos de cobertura.")
      setCoverageBusy(false)
      return
    }

    try {
      if (editingCoverage) {
        await updatePatientCoverage(patientId, editingCoverage.id, input)
      } else {
        await addPatientCoverage(patientId, input)
      }
      setEditingCoverage(null)
      await load()
    } catch (requestError) {
      setCoverageError(requestError instanceof ApiError
        ? getClinicErrorMessage(requestError, "No se pudo guardar la cobertura.")
        : "No se pudo guardar la cobertura. Revisá los datos e intentá nuevamente.")
    } finally {
      setCoverageBusy(false)
    }
  }

  return (
    <ClinicPage
      eyebrow="Pacientes"
      title={patient ? `${patient.firstName} ${patient.lastName}` : "Ficha del paciente"}
      description="Información de identificación y cobertura. Los datos se muestran únicamente si la API autoriza el acceso."
    >
      {loading && <LoadingState label="Cargando ficha y coberturas..." />}
      {error && <ErrorState description={error} onRetry={() => void load()} />}
      {!loading && !error && patient && (
        <>
          <ClinicCard>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="Documento" value={patient.nationalId} />
              <Info label="Fecha de nacimiento" value={patient.birthDate ? formatDate(patient.birthDate) : "—"} />
              <Info label="Teléfono" value={patient.phone ?? "—"} />
              <Info label="Email" value={patient.email ?? "—"} />
              <Info label="Domicilio" value={patient.address ?? "—"} />
            </div>
            <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
              {canEditOwnProfile && (
                <Link href={`/patients/${encodeURIComponent(patientId)}/edit`} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">
                  Editar mis datos de contacto
                </Link>
              )}
              {canEditOwnProfile && (
                <Link href={`/patients/${encodeURIComponent(patientId)}/medical-history`} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-teal-800">
                  Historial clínico
                </Link>
              )}
              <Link href="/patients" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
                Volver a pacientes
              </Link>
            </div>
          </ClinicCard>

          <ClinicCard>
            <h2 className="text-lg font-semibold text-slate-900">Coberturas</h2>
            {coverages.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="Sin coberturas registradas" description="No hay coberturas asociadas a este perfil." />
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3 font-medium">Prestador</th>
                      <th className="px-3 py-3 font-medium">Afiliado</th>
                      <th className="px-3 py-3 font-medium">Vigencia</th>
                      <th className="px-3 py-3 font-medium">Estado</th>
                      {canManageCoverage && <th className="px-3 py-3 font-medium">Acción</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {coverages.map((coverage) => (
                      <tr key={coverage.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-3">{coverage.providerName}{coverage.primary ? " · Principal" : ""}</td>
                        <td className="px-3 py-3">{coverage.memberNumber}</td>
                        <td className="px-3 py-3">{formatDate(coverage.validFrom)}{coverage.validUntil ? ` – ${formatDate(coverage.validUntil)}` : ""}</td>
                        <td className="px-3 py-3">{coverage.active ? "Activa" : "Inactiva"}</td>
                        {canManageCoverage && (
                          <td className="px-3 py-3">
                            <button type="button" className="font-medium text-teal-800 underline" onClick={() => setEditingCoverage(coverage)}>
                              Editar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ClinicCard>

          {canManageCoverage && (
            <ClinicCard>
              <h2 className="text-lg font-semibold text-slate-900">{editingCoverage ? "Actualizar cobertura" : "Agregar cobertura"}</h2>
              <p className="mt-1 text-sm text-slate-600">
                El contrato no incluye consulta del catálogo de prestadores; ingresá el ID asignado por el consultorio.
              </p>
              <form key={editingCoverage?.id ?? "new"} className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submitCoverage}>
                <FormField id="providerId" name="providerId" label="ID del prestador" required pattern="[0-9]+" defaultValue={editingCoverage?.providerId ?? ""} disabled={coverageBusy} />
                <FormField id="memberNumber" name="memberNumber" label="Número de afiliado" required maxLength={50} defaultValue={editingCoverage?.memberNumber ?? ""} disabled={coverageBusy} />
                <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                  Relación
                  <select name="relationship" defaultValue={editingCoverage?.relationship ?? ""} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                    <option value="">No especificada</option>
                    <option value="titular">Titular</option>
                    <option value="beneficiario">Beneficiario</option>
                    <option value="extension">Extensión</option>
                  </select>
                </label>
                <FormField id="validFrom" name="validFrom" label="Vigente desde" type="date" required defaultValue={editingCoverage?.validFrom ?? ""} disabled={coverageBusy} />
                <FormField id="validUntil" name="validUntil" label="Vigente hasta (opcional)" type="date" defaultValue={editingCoverage?.validUntil ?? ""} disabled={coverageBusy} />
                <FormField id="holderNationalId" name="holderNationalId" label="Documento del titular (opcional)" maxLength={20} defaultValue={editingCoverage?.holderNationalId ?? ""} disabled={coverageBusy} />
                <FormField id="holderRelationship" name="holderRelationship" label="Vínculo con el titular (opcional)" maxLength={50} defaultValue={editingCoverage?.holderRelationship ?? ""} disabled={coverageBusy} />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="primary" defaultChecked={editingCoverage?.primary ?? false} />
                  Cobertura principal
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="active" defaultChecked={editingCoverage?.active ?? true} />
                  Cobertura activa
                </label>
                {coverageError && <div className="sm:col-span-2"><ErrorState description={coverageError} /></div>}
                <div className="flex flex-wrap gap-3 sm:col-span-2">
                  <button type="submit" disabled={coverageBusy} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                    {coverageBusy ? "Guardando..." : editingCoverage ? "Actualizar cobertura" : "Agregar cobertura"}
                  </button>
                  {editingCoverage && (
                    <button type="button" onClick={() => setEditingCoverage(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
                      Cancelar edición
                    </button>
                  )}
                </div>
              </form>
            </ClinicCard>
          )}
        </>
      )}
    </ClinicPage>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm text-slate-900">{value}</p>
    </div>
  )
}
