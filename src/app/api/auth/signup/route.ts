import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyUserSessionCookie, hashPassword, hashToken, newVerificationTokenRaw } from "@/lib/userAuth";
import { sendVerificationEmail } from "@/lib/mail";
import { rateLimit } from "@/lib/rateLimit";

const VERIFY_TTL_MS = 1000 * 60 * 60 * 48;

function prismaSignupErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/SQLITE_READONLY|read-only|EROFS|EPERM/i.test(msg)) {
    return "Database is read-only on this host (common on serverless with a local file DB). Use a hosted database (e.g. Vercel Postgres / Turso) and set DATABASE_URL.";
  }
  if (/P1001|P1017|can't reach database/i.test(msg)) {
    return "Cannot reach the database. Check DATABASE_URL and that `npx prisma db push` has been run.";
  }
  return "Could not save account. Check DATABASE_URL and run `npx prisma db push` locally.";
}

export async function POST(req: NextRequest) {
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

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "Account already exists" }, { status: 409 });

  const resendConfigured = Boolean(process.env.RESEND_API_KEY?.trim());
  const isDev = process.env.NODE_ENV !== "production";

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch {
    return NextResponse.json({ error: "Could not hash password. Try again." }, { status: 500 });
  }

  // --- No email provider: one-step signup (verified + signed in) so accounts always work out of the box ---
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

  // --- Resend configured: verify-by-email flow; if send fails, still let user in so they’re not stuck ---
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
    return NextResponse.json({ error: "Could not create verification token." }, { status: 500 });
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
}
