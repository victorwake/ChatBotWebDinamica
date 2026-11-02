import AvailabilitySearch from "@/components/appointments/AvailabilitySearch"

type SearchParams = Record<string, string | string[] | undefined>

function firstString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined
}

function dateParameter(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

function idParameter(value: string | undefined): string | undefined {
  return value && /^\d+$/.test(value) ? value : undefined
}

export default async function AppointmentAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const page = Number(firstString(params.page))
  const rescheduleId = firstString(params.reschedule)

  return (
    <AvailabilitySearch
      rescheduleId={rescheduleId && /^\d+$/.test(rescheduleId) ? rescheduleId : undefined}
      initialSearch={{
        from: dateParameter(firstString(params.from)),
        to: dateParameter(firstString(params.to)),
        doctorId: idParameter(firstString(params.doctorId)),
        specialtyId: idParameter(firstString(params.specialtyId)),
        page: Number.isInteger(page) && page > 0 && page <= 1_000_000 ? page : undefined,
        slotId: firstString(params.slotId)?.match(/^[A-Za-z0-9_-]{1,200}$/) ? firstString(params.slotId) : undefined,
      }}
    />
  )
}
