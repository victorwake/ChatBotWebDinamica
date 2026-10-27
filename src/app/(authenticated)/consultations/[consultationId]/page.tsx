import ClinicalConsultationDetail from "@/components/clinical/ClinicalConsultationDetail"

export default async function ConsultationDetailPage({
  params,
}: {
  params: Promise<{ consultationId: string }>
}) {
  const { consultationId } = await params
  return <ClinicalConsultationDetail consultationId={consultationId} />
}
