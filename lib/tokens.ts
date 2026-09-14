import { randomBytes, createHash } from "crypto";

/**
 * Generate a cryptographically secure personal access token.
 * Format: pp_<64 hex chars> (32 bytes = 256 bits of entropy)
 * The "pp_" prefix helps secret scanners identify leaked tokens.
 */
export function generateToken(): string {
  return `pp_${randomBytes(32).toString("hex")}`;
}

/**
 * Hash a raw token using SHA-256 for storage.
 * High-entropy random tokens don't need slow hashing (bcrypt/argon2)
 * — the same approach used by GitHub, Stripe, and Vercel.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
