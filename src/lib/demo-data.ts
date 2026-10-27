import type { Patient } from "@/data/mockPatients"

export const demoDataEnabled = process.env.NEXT_PUBLIC_ENABLE_DEMO_DATA === "true"

export async function loadDemoPatients(): Promise<Patient[]> {
  if (!demoDataEnabled) return []
  const { mockPatients } = await import("@/data/mockPatients")
  return mockPatients
}
