import { EmptyState } from "@/components/ui/states"

export default function FeaturePlaceholder({
  title,
  description,
  phase,
}: {
  title: string
  description: string
  phase: string
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center p-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
        {phase}
      </p>
      <EmptyState title={title} description={description} />
    </div>
  )
}
