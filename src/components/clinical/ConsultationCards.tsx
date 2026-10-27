import Link from "next/link"
import { ClinicCard, formatDateTime } from "@/components/clinic/ClinicPrimitives"
import type { ClinicalConsultation } from "@/lib/clinic"

export function ConsultationCards({ items }: { items: ClinicalConsultation[] }) {
  return (
    <div className="space-y-3">
      {items.map((consultation) => (
        <ClinicCard key={consultation.id}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">
                {formatDateTime(consultation.consultationDate)}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {consultation.specialty.name} · {consultation.doctor.displayName}
              </p>
              {consultation.primaryDiagnosis && (
                <p className="mt-3 text-sm text-slate-800">
                  <span className="font-medium">Diagnóstico principal:</span> {consultation.primaryDiagnosis}
                </p>
              )}
              {consultation.reason && (
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-medium">Motivo:</span> {consultation.reason}
                </p>
              )}
            </div>
            <Link
              href={`/consultations/${encodeURIComponent(consultation.id)}`}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-teal-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Ver atención
            </Link>
          </div>
        </ClinicCard>
      ))}
    </div>
  )
}

export function ConsultationPager({
  page,
  pageSize,
  totalItems,
  onPageChange,
}: {
  page: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize))
  return (
    <nav aria-label="Paginación del historial clínico" className="flex items-center justify-between gap-4">
      <p className="text-sm text-slate-600">
        {totalItems === 0 ? "Sin registros" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalItems)} de ${totalItems}`}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          Anterior
        </button>
        <span className="self-center text-sm text-slate-600">Página {page} de {pageCount}</span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          Siguiente
        </button>
      </div>
    </nav>
  )
}

export function isClinicalViewer(roles: string[]): boolean {
  return roles.includes("patient") || roles.includes("doctor")
}

export function isClinicalPatientOwner(
  roles: string[],
  userPatientId: string | undefined,
  patientId: string,
): boolean {
  return roles.includes("patient") && userPatientId === patientId
}
