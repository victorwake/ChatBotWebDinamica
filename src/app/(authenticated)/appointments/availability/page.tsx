import AvailabilitySearch from "@/components/appointments/AvailabilitySearch"

export default async function AppointmentAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ reschedule?: string | string[] }>
}) {
  const { reschedule } = await searchParams
  return <AvailabilitySearch rescheduleId={typeof reschedule === "string" ? reschedule : undefined} />
}
