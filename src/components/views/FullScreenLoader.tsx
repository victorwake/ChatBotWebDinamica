"use client"

import { motion } from "framer-motion"

export default function FullScreenLoader() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-1 flex-col items-center justify-center gap-4"
    >
      <div className="relative h-12 w-12">
        <span className="absolute inset-0 rounded-full border-2 border-teal-100" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-teal-700" />
      </div>
      <p className="text-sm text-slate-500">Cargando vista…</p>
    </motion.div>
  )
}
