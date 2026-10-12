import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";

export function randomCredential(): string {
  return randomBytes(32).toString("base64url");
}

export function randomIdentifier(): string {
  return randomBytes(16).toString("hex");
}

export function credentialHash(secret: string, purpose: "invite" | "session" | "ip", value: string): string {
  return createHmac("sha256", secret).update(`architekt:${purpose}:`).update(value).digest("hex");
}

export function parseInviteCode(value: unknown): { id: string; credential: string } | undefined {
  if (typeof value !== "string") return;
  const parts = /^([a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/.exec(value);
  return parts ? { id: parts[1], credential: parts[2] } : undefined;
}

export function validSessionCredential(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** Vercel overwrites this header with the client IP; never use it off-platform. */
export function trustedVercelClientIp(request: Request, vercelDeployment: boolean): string | undefined {
  if (!vercelDeployment) return;
  const value = request.headers.get("x-forwarded-for");
  return value && isIP(value) ? value : undefined;
}
