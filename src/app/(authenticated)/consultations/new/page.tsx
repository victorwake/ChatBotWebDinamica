import ClinicalConsultationCreateForm from "@/components/clinical/ClinicalConsultationCreateForm"

export default async function NewConsultationPage({
  searchParams,
}: {
  searchParams: Promise<{ appointmentId?: string | string[] }>
}) {
  const { appointmentId } = await searchParams
  return <ClinicalConsultationCreateForm appointmentId={typeof appointmentId === "string" ? appointmentId : undefined} />
}
