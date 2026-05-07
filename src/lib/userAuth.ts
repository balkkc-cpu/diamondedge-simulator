import crypto from "crypto";
import type { NextResponse } from "next/server";

const USER_COOKIE = "diamondedge_user_session";

export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export const sessionCookieBaseOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_COOKIE_MAX_AGE
};

function authSecret() {
  return process.env.AUTH_SECRET || "change-this-in-production";
}

export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      try {
        const a = Buffer.from(key, "hex");
        if (a.length !== derivedKey.length) return resolve(false);
        resolve(crypto.timingSafeEqual(a, derivedKey));
      } catch {
        resolve(false);
      }
    });
  });
}

function sign(payload: string) {
  return crypto.createHmac("sha256", authSecret()).update(payload).digest("hex");
}

export function makeUserSession(email: string) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const payload = `${email}.${exp}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyUserSession(token?: string | null) {
  if (!token) return { valid: false as const };
  const parts = token.split(".");
  if (parts.length < 3) return { valid: false as const };
  const sig = parts.pop() as string;
  const exp = Number(parts.pop());
  const email = parts.join(".");
  if (!Number.isFinite(exp) || Date.now() > exp) return { valid: false as const };
  const expected = sign(`${email}.${exp}`);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return { valid: false as const };
    if (!crypto.timingSafeEqual(a, b)) return { valid: false as const };
  } catch {
    return { valid: false as const };
  }
  return { valid: true as const, email };
}

/** Prefer this in Route Handlers so the session cookie is guaranteed on the response (Next.js App Router). */
export function applyUserSessionCookie(res: NextResponse, email: string) {
  res.cookies.set(USER_COOKIE, makeUserSession(email), sessionCookieBaseOptions);
}

export function clearUserSessionCookie(res: NextResponse) {
  res.cookies.set(USER_COOKIE, "", { path: "/", maxAge: 0 });
}

export const USER_COOKIE_NAME = USER_COOKIE;

export function newVerificationTokenRaw() {
  return crypto.randomBytes(24).toString("hex");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
