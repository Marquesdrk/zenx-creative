import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "zenx_meta_oauth_state";
const MAX_AGE_SECONDS = 10 * 60;

function secret(): string {
  const value = process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("META_TOKEN_ENCRYPTION_KEY não definida.");
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createOAuthStateCookie(state: string): string {
  const payload = `${state}.${Date.now()}`;
  return `${COOKIE_NAME}=${encodeURIComponent(`${payload}.${signature(payload)}`)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function clearOAuthStateCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function verifyOAuthStateCookie(request: Request, expectedState: string): boolean {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;

  try {
    const value = decodeURIComponent(match[1]);
    const parts = value.split(".");
    if (parts.length !== 3) return false;
    const [state, issuedAtText, actualSignature] = parts;
    const issuedAt = Number(issuedAtText);
    if (state !== expectedState || !Number.isFinite(issuedAt)) return false;
    if (Date.now() - issuedAt < 0 || Date.now() - issuedAt > MAX_AGE_SECONDS * 1000) return false;

    const expectedSignature = signature(`${state}.${issuedAtText}`);
    const actual = Buffer.from(actualSignature);
    const expected = Buffer.from(expectedSignature);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
