"use client"

import { AnimatePresence, motion } from "framer-motion"
import type { ViewType } from "@/types"
import WelcomeView from "./WelcomeView"
import LoginView from "./LoginView"
import PatientsView from "./PatientsView"
import PatientDetailView from "./PatientDetailView"
import AppointmentView from "./AppointmentView"
import ReportView from "./ReportView"

const views: Record<ViewType, React.FC<{ data?: Record<string, unknown> }>> = {
  welcome: WelcomeView,
  login: LoginView,
  patients: PatientsView,
  patient_detail: PatientDetailView,
  appointment: AppointmentView,
  report: ReportView,
}

export default function ViewRenderer({ view, data }: { view: ViewType; data?: Record<string, unknown> }) {
  const Component = views[view]
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={view}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="flex flex-1 flex-col"
      >
        <Component data={data} />
      </motion.div>
    </AnimatePresence>
  )
}
