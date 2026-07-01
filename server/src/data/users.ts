export type User = {
  id: string
  email: string
  password: string
  name: string
}

export const users: User[] = [
  { id: "1", email: "admin@medico.com", password: "123456", name: "Admin" },
  { id: "2", email: "doctor@medico.com", password: "123456", name: "Dr. Fernández" },
]
