import { randomBytes } from "node:crypto"
import argon2 from "argon2"
import bcrypt from "bcryptjs"
import { logger } from "../logger"

const argonOptions = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
}

const dummyHash = argon2.hash(randomBytes(32).toString("hex"), argonOptions)

export async function verifyPassword(
  password: string,
  storedHash: string | undefined,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (storedHash?.startsWith("$argon2id$")) {
    try {
      return {
        valid: await argon2.verify(storedHash, password),
        needsRehash: argon2.needsRehash(storedHash, argonOptions),
      }
    } catch (error) {
      logger.error("Hash Argon2id inválido almacenado para una cuenta", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      })
      return { valid: false, needsRehash: false }
    }
  }

  if (storedHash && /^\$2[aby]\$\d{2}\$/.test(storedHash)) {
    try {
      const valid = await bcrypt.compare(password, storedHash)
      return { valid, needsRehash: valid }
    } catch (error) {
      logger.error("Hash bcrypt inválido almacenado para una cuenta", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      })
      return { valid: false, needsRehash: false }
    }
  }

  await argon2.verify(await dummyHash, password)
  if (storedHash) {
    logger.error("Formato de hash de contraseña no soportado", {
      hashPrefix: storedHash.slice(0, 12),
    })
  }
  return { valid: false, needsRehash: false }
}

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, argonOptions)
}
