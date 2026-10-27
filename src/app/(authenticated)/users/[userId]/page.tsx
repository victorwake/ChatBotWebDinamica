import AccountDetail from "@/components/administration/AccountDetail"

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  return <AccountDetail userId={userId} />
}
