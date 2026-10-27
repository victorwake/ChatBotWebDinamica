import DoctorDirectory from "@/components/scheduling/DoctorDirectory"

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<{ specialtyId?: string | string[] }>
}) {
  const { specialtyId } = await searchParams
  return <DoctorDirectory initialSpecialtyId={typeof specialtyId === "string" ? specialtyId : undefined} />
}
