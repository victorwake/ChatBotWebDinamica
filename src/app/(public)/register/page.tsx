import PatientRegistrationForm from "@/components/auth/PatientRegistrationForm"
import { safeInternalPath } from "@/lib/session"

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  const nextPath = safeInternalPath(typeof next === "string" ? next : null)

  return <PatientRegistrationForm nextPath={nextPath} />
}
