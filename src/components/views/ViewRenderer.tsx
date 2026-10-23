"use client"

import { AnimatePresence, motion } from "framer-motion"
import type { ViewType, Action } from "@/types"
import WelcomeView from "./WelcomeView"
import LoginView from "./LoginView"
import PatientsView from "./PatientsView"
import PatientDetailView from "./PatientDetailView"
import AppointmentView from "./AppointmentView"
import ReportView from "./ReportView"

const views: Record<ViewType, React.FC<{ data?: Record<string, unknown>; onAction?: (action: Action) => void }>> = {
  welcome: WelcomeView,
  login: LoginView,
  patients: PatientsView,
  patient_detail: PatientDetailView,
  appointment: AppointmentView,
  report: ReportView,
}

export default function ViewRenderer({
  view,
  data,
  onAction,
}: {
  view: ViewType
  data?: Record<string, unknown>
  onAction?: (action: Action) => void
}) {
  const Component = views[view]
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={view}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="flex flex-1 flex-col"
      >
        <Component data={data} onAction={onAction} />
      </motion.div>
    </AnimatePresence>
  )
}
