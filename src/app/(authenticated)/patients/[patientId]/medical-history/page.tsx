import PatientMedicalHistory from "@/components/clinical/PatientMedicalHistory"

export default async function PatientMedicalHistoryPage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const { patientId } = await params
  return <PatientMedicalHistory patientId={patientId} />
}
