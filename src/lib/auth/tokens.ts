import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

const ALGORITHMS: jwt.Algorithm[] = ["HS256"];

function secret(name: "ACCESS_TOKEN_SECRET" | "REFRESH_TOKEN_SECRET" | "SUPER_ADMIN_TOKEN_SECRET"): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set to a random string of at least 32 characters`);
  }
  return value;
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SUPER_ADMIN_TOKEN_TTL_SECONDS = 4 * 60 * 60;

export interface AccessTokenClaims {
  userId: string;
  organizationId: string;
  slug: string;
  isOwner: boolean;
  role: string | null;
  locationId: string | null; // active location
  permissions: string[];
  plan: string;
}

export interface RefreshTokenClaims {
  userId: string;
  sessionId: string; // refresh_tokens.id
}

export interface SuperAdminClaims {
  superAdminId: string;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign({ ...claims, typ: "access" }, secret("ACCESS_TOKEN_SECRET"), {
    algorithm: "HS256",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const decoded = jwt.verify(token, secret("ACCESS_TOKEN_SECRET"), { algorithms: ALGORITHMS }) as AccessTokenClaims & { typ?: string };
  if (decoded.typ !== "access") throw new Error("Invalid token type");
  return decoded;
}

export function signRefreshToken(claims: RefreshTokenClaims): string {
  // jwtid makes every rotation produce a new token, even two within the same second
  return jwt.sign({ ...claims, typ: "refresh" }, secret("REFRESH_TOKEN_SECRET"), {
    algorithm: "HS256",
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    jwtid: randomUUID(),
  });
}

export function verifyRefreshToken(token: string): RefreshTokenClaims {
  const decoded = jwt.verify(token, secret("REFRESH_TOKEN_SECRET"), { algorithms: ALGORITHMS }) as RefreshTokenClaims & { typ?: string };
  if (decoded.typ !== "refresh") throw new Error("Invalid token type");
  return decoded;
}

export function signSuperAdminToken(claims: SuperAdminClaims): string {
  return jwt.sign({ ...claims, typ: "platform" }, secret("SUPER_ADMIN_TOKEN_SECRET"), {
    algorithm: "HS256",
    expiresIn: SUPER_ADMIN_TOKEN_TTL_SECONDS,
  });
}

export function verifySuperAdminToken(token: string): SuperAdminClaims {
  const decoded = jwt.verify(token, secret("SUPER_ADMIN_TOKEN_SECRET"), { algorithms: ALGORITHMS }) as SuperAdminClaims & { typ?: string };
  if (decoded.typ !== "platform") throw new Error("Invalid token type");
  return decoded;
}
