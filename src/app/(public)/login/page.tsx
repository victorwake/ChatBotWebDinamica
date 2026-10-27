import LoginForm from "@/components/auth/LoginForm"
import { safeInternalPath } from "@/lib/session"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  const nextPath = safeInternalPath(typeof next === "string" ? next : null)

  return <LoginForm nextPath={nextPath} />
}
