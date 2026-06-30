"use client"

import { motion } from "framer-motion"

export default function FullScreenLoader() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
    >
      <motion.img
        src="/Robot Loader.svg"
        alt="Cargando..."
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
        style={{ width: 200, height: 200 }}
      />
    </motion.div>
  )
}
