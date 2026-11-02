import DoctorDirectory from "@/components/scheduling/DoctorDirectory"

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<{ specialtyId?: string | string[] }>
}) {
  const { specialtyId } = await searchParams
  const validatedSpecialtyId = typeof specialtyId === "string" && /^\d+$/.test(specialtyId)
    ? specialtyId
    : undefined
  return <DoctorDirectory initialSpecialtyId={validatedSpecialtyId} />
}
