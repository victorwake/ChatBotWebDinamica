"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { ApiError } from "@/lib/api"
import {
  getCurrentUser,
  isUnauthenticatedError,
  signIn as authenticate,
  signOut as endSession,
  type CurrentUser,
} from "@/lib/session"

type SessionStatus = "loading" | "authenticated" | "unauthenticated" | "error"

type SessionContextValue = {
  user: CurrentUser | null
  status: SessionStatus
  error: unknown
  refresh: () => Promise<void>
  signIn: (email: string, password: string) => Promise<CurrentUser>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [status, setStatus] = useState<SessionStatus>("loading")
  const [error, setError] = useState<unknown>(null)

  const loadSession = useCallback(async (signal?: AbortSignal) => {
    try {
      const currentUser = await getCurrentUser(signal)
      setUser(currentUser)
      setError(null)
      setStatus("authenticated")
    } catch (requestError) {
      if (signal?.aborted) return
      setUser(null)
      if (isUnauthenticatedError(requestError)) {
        setStatus("unauthenticated")
      } else {
        setError(requestError)
        setStatus("error")
      }
    }
  }, [])

  const refresh = useCallback(async () => {
    await loadSession()
  }, [loadSession])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => loadSession(controller.signal))
    return () => controller.abort()
  }, [loadSession])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    window.addEventListener("focus", refreshWhenVisible)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      window.removeEventListener("focus", refreshWhenVisible)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [refresh])

  const signIn = useCallback(async (email: string, password: string) => {
    const authenticatedUser = await authenticate(email, password)
    setUser(authenticatedUser)
    setError(null)
    setStatus("authenticated")
    return authenticatedUser
  }, [])

  const signOut = useCallback(async () => {
    try {
      await endSession()
      setUser(null)
      setError(null)
      setStatus("unauthenticated")
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        setUser(null)
        setError(null)
        setStatus("unauthenticated")
        return
      }
      throw requestError
    }
  }, [])

  const value = useMemo(
    () => ({ user, status, error, refresh, signIn, signOut }),
    [user, status, error, refresh, signIn, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error("useSession must be used inside SessionProvider.")
  return context
}
