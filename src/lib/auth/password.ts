import bcrypt from "bcrypt";
import { createHash, randomBytes, randomInt } from "crypto";

const SALT_ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, SALT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** SHA-256 — for high-entropy tokens (refresh tokens, links), not passwords. */
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** 6-digit numeric code for password reset emails. */
export const randomCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

// Compared against when the email does not exist, so login timing does not
// reveal which emails are registered.
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(randomToken(16), SALT_ROUNDS);
  return dummyHash;
}
