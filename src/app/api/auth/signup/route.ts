import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyUserSessionCookie, hashPassword, hashToken, newVerificationTokenRaw } from "@/lib/userAuth";
import { sendVerificationEmail } from "@/lib/mail";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const VERIFY_TTL_MS = 1000 * 60 * 60 * 48;

function prismaErrorCode(e: unknown): string | undefined {
  if (e && typeof e === "object" && "code" in e) return String((e as { code: unknown }).code);
  return undefined;
}

function prismaSignupErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code = prismaErrorCode(e);
  if (/no such table|does not exist|P2021|relation.*does not exist/i.test(msg)) {
    return "Database tables are missing on the server. In Vercel (or your host) run a migration: connect with DATABASE_URL then `npx prisma db push` against that same database.";
  }
  if (/SQLITE_READONLY|read-only|EROFS|EPERM/i.test(msg)) {
    return "Database is read-only on this host (common on serverless with a local file DB). Use a hosted database (e.g. Vercel Postgres / Turso) and set DATABASE_URL.";
  }
  if (/P1001|P1017|can't reach database|ECONNREFUSED|Server has closed the connection/i.test(msg)) {
    return "Cannot reach the database. Check DATABASE_URL in Vercel → Settings → Environment Variables, then redeploy.";
  }
  if (/P1000|authentication failed|password authentication failed/i.test(msg)) {
    return "Database rejected the credentials in DATABASE_URL. Regenerate the password in your host (e.g. Neon/Vercel Postgres) and paste the full connection string again.";
  }
  if (/does not support|provider.*mismatch|error opening a TLS connection/i.test(msg)) {
    return "DATABASE_URL does not match this app’s Prisma setup (e.g. Postgres URL but the schema is still SQLite). Use a SQLite-compatible hosted DB (Turso) or switch the Prisma datasource to postgresql and redeploy.";
  }
  if (/Unique constraint|already exists|P2002/i.test(msg)) {
    return "Account already exists for that email.";
  }
  if (code && /^P[0-9]/.test(code)) {
    return `Database error (${code}). Check Vercel logs and DATABASE_URL; run \`npx prisma db push\` against the same database your app uses.`;
  }
  return "Could not save account. Check DATABASE_URL on the server and that Prisma has been applied to that database (`npx prisma db push`).";
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    if (!rateLimit(`signup:${ip}`, 10, 60_000).allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let body: { email?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email.includes("@") || password.length < 8) {
      return NextResponse.json({ error: "Invalid email or password too short" }, { status: 400 });
    }

    let exists: { id: string } | null;
    try {
      exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    } catch (e) {
      console.error("[signup] prisma findUnique failed:", e);
      return NextResponse.json({ error: prismaSignupErrorMessage(e), prismaCode: prismaErrorCode(e) }, { status: 500 });
    }
    if (exists) return NextResponse.json({ error: "Account already exists" }, { status: 409 });

    const resendConfigured = Boolean(process.env.RESEND_API_KEY?.trim());
    const isDev = process.env.NODE_ENV !== "production";

    let passwordHash: string;
    try {
      passwordHash = await hashPassword(password);
    } catch {
      return NextResponse.json({ error: "Could not hash password. Try again." }, { status: 500 });
    }

    if (!resendConfigured) {
      let user;
      try {
        user = await prisma.user.create({
          data: { email, passwordHash, emailVerified: true }
        });
      } catch (e) {
        console.error("[signup] prisma create failed:", e);
        return NextResponse.json({ error: prismaSignupErrorMessage(e) }, { status: 500 });
      }
      const res = NextResponse.json({
        ok: true,
        loggedIn: true,
        emailVerificationSkipped: true,
        message:
          "Account created — you’re signed in. (Email verification is skipped because RESEND_API_KEY is not set — add Resend later if you want verify-by-email.)"
      });
      applyUserSessionCookie(res, user.email);
      return res;
    }

    let user;
    try {
      user = await prisma.user.create({ data: { email, passwordHash, emailVerified: false } });
    } catch (e) {
      console.error("[signup] prisma create failed:", e);
      return NextResponse.json({ error: prismaSignupErrorMessage(e) }, { status: 500 });
    }

    const raw = newVerificationTokenRaw();
    try {
      await prisma.verificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(raw),
          type: "email_verify",
          expiresAt: new Date(Date.now() + VERIFY_TTL_MS)
        }
      });
    } catch (e) {
      console.error("[signup] token create failed:", e);
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      return NextResponse.json({ error: prismaSignupErrorMessage(e) }, { status: 500 });
    }

    const origin = (process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin).replace(/\/$/, "");
    const verifyUrl = `${origin}/verify-email?token=${raw}`;

    const mail = await sendVerificationEmail(email, verifyUrl);

    if (!mail.delivered) {
      await prisma.verificationToken.deleteMany({ where: { userId: user.id } });
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
      const res = NextResponse.json({
        ok: true,
        loggedIn: true,
        emailSendingFailed: true,
        message:
          mail.error ??
          "Account created — you’re signed in. The confirmation email could not be sent (check RESEND_FROM_EMAIL / domain). You can use Login with your password.",
        ...(isDev ? { devVerifyUrl: verifyUrl } : {})
      });
      applyUserSessionCookie(res, user.email);
      return res;
    }

    const exposeLink = isDev || process.env.EXPOSE_DEV_VERIFY_LINK === "1";
    return NextResponse.json({
      ok: true,
      emailSent: true,
      loggedIn: false,
      message: "Check your inbox (and spam) for the verification link.",
      ...(exposeLink ? { devVerifyUrl: verifyUrl } : {}),
      ...(mail.error ? { mailError: mail.error } : {})
    });
  } catch (e) {
    console.error("[signup] fatal:", e);
    const code = prismaErrorCode(e);
    const msg = e instanceof Error ? e.message : String(e);
    const looksLikeDb =
      Boolean(code) ||
      /prisma|query engine|database|SQLITE|SQLITE_|postgres|connection/i.test(msg);
    const generic =
      "Unexpected server error during signup. If you are on Vercel, set DATABASE_URL to a hosted database, run `npx prisma db push` against it once, then redeploy.";
    const debug = process.env.SIGNUP_DEBUG_ERRORS === "1" || process.env.NODE_ENV !== "production";
    return NextResponse.json(
      {
        error: looksLikeDb ? prismaSignupErrorMessage(e) : generic,
        ...(code ? { prismaCode: code } : {}),
        ...(debug ? { debugMessage: msg } : {})
      },
      { status: 500 }
    );
  }
}
