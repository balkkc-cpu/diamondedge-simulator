import crypto from "crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "diamondedge_admin_session";

function secret() {
  return process.env.AUTH_SECRET || "change-this-in-production";
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createSessionToken(username: string): string {
  const exp = Date.now() + 1000 * 60 * 60 * 24;
  const payload = `${username}.${exp}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifySessionToken(token?: string | null): { valid: boolean; username?: string } {
  if (!token) return { valid: false };
  const parts = token.split(".");
  if (parts.length < 3) return { valid: false };
  const sig = parts.pop() as string;
  const exp = Number(parts.pop());
  const username = parts.join(".");
  const payload = `${username}.${exp}`;
  const expected = sign(payload);
  if (sig !== expected) return { valid: false };
  if (!Number.isFinite(exp) || Date.now() > exp) return { valid: false };
  return { valid: true, username };
}

export function isValidOwnerCredential(username: string, password: string): boolean {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedUser || !expectedHash) return false;
  return username === expectedUser && sha256(password) === expectedHash;
}

export function setAdminSession(username: string) {
  const token = createSessionToken(username);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24
  });
}

export function clearAdminSession() {
  cookies().set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

export function isAdminSession(): boolean {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySessionToken(token).valid;
}

export const ADMIN_COOKIE_NAME = SESSION_COOKIE;
