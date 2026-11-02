import PatientInvitationForm from "@/components/patients/PatientInvitationForm"

export default async function PatientInvitationPage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const { patientId } = await params
  return <PatientInvitationForm patientId={patientId} />
}
