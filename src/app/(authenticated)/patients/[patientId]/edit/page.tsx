import PatientEditForm from "@/components/patients/PatientEditForm"

export default async function PatientEditPage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const { patientId } = await params
  return <PatientEditForm patientId={patientId} />
}
