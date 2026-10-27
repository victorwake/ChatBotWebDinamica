import AppointmentDetail from "@/components/appointments/AppointmentDetail"

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>
}) {
  const { appointmentId } = await params
  return <AppointmentDetail appointmentId={appointmentId} />
}
