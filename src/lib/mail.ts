import { Resend } from "resend";

export type SendMailResult = {
  delivered: boolean;
  fallback: boolean;
  error?: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Comma/semicolon-separated list; strips quotes/Vercel copy-paste noise. */
function ownerRecipients(): string[] {
  const raw =
    process.env.OWNER_NOTIFY_EMAIL?.trim() ||
    process.env.ADMIN_NOTIFY_EMAIL?.trim() ||
    "";
  if (!raw) return [];

  const stripQuotes = (s: string) => s.trim().replace(/^\ufeff/, "").replace(/^["']+|["']+$/g, "").trim();

  return raw
    .split(/[,;\n\r]+/)
    .map((s) => stripQuotes(s))
    .filter((s) => {
      if (!s || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return false;
      return true;
    });
}

function summarizeResendErr(err: { message?: string; name?: string } | null | undefined): string {
  if (!err) return "unknown_error";
  return [err.name, err.message].filter(Boolean).join(": ");
}

function stripTagsForPlain(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function sendTransactionalEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  logFallback: string;
  tags?: { name: string; value: string }[];
}): Promise<SendMailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "DiamondEdge <onboarding@resend.dev>";
  const text = stripTagsForPlain(opts.html);

  if (!opts.to.length) return { delivered: false, fallback: false };

  if (!apiKey) {
    console.warn(
      `[DiamondEdge] mail skipped — RESEND_API_KEY is not set (${opts.logFallback}). ` +
        `OWNER_NOTIFY_EMAIL is ignored until Resend is configured.`
    );
    return { delivered: false, fallback: true, error: "RESEND_API_KEY missing" };
  }

  try {
    const resend = new Resend(apiKey);
    const failures: string[] = [];
    let successCount = 0;
    /** One POST per inbox — avoids one bad address rejecting the batch. */
    for (const to of opts.to) {
      const result = await resend.emails.send({
        from,
        to,
        subject: opts.subject,
        html: opts.html,
        text,
        ...(opts.tags?.length ? { tags: opts.tags } : {})
      });
      if (result.error) {
        const msg = summarizeResendErr(result.error);
        failures.push(`${to}:${msg}`);
        console.error("[DiamondEdge] Resend rejected send:", msg);
      } else if (result.data?.id) {
        successCount += 1;
        console.info(`[DiamondEdge] mail queued ok resend_id=${result.data.id} to=${to}`);
      }
    }
    if (successCount === 0) {
      return { delivered: false, fallback: true, error: failures.join(" | ") || "Resend rejected all recipients" };
    }
    if (failures.length) {
      console.warn("[DiamondEdge] mail partial failures:", failures.join("; "));
    }
    return { delivered: true, fallback: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Email send failed";
    console.error("[DiamondEdge] sendTransactionalEmail:", e);
    return { delivered: false, fallback: true, error: msg };
  }
}

/**
 * Owner signup alert. Must be awaited on serverless (Vercel): fire-and-forget promises
 * are often cut off when the route handler returns.
 */
export async function notifyOwnerNewSignup(
  newUserEmail: string,
  opts?: { awaitingEmailVerification?: boolean }
): Promise<void> {
  const rawOwner = process.env.OWNER_NOTIFY_EMAIL ?? process.env.ADMIN_NOTIFY_EMAIL ?? "";
  const recipients = ownerRecipients();
  if (!recipients.length) {
    console.warn(
      `[DiamondEdge] owner signup notify skipped: OWNER_NOTIFY_EMAIL empty or invalid (raw_len=${rawOwner.length}). ` +
        "Use a bare address like balkkc@gmail.com — no wrapping quotes."
    );
    return;
  }
  const awaiting = opts?.awaitingEmailVerification ?? false;
  const detail = awaiting
    ? "They still need to click the verification link in their inbox."
    : "They can sign in (email already verified).";
  try {
    const r = await sendTransactionalEmail({
      to: recipients,
      subject: `[DiamondEdge] New signup: ${newUserEmail}`,
      html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>New member</h2>
        <p><strong>Email:</strong> ${escapeHtml(newUserEmail)}</p>
        <p>${detail}</p>
      </div>
    `,
      logFallback: `owner notify signup → ${recipients.join(", ")} (${newUserEmail})`,
      tags: [{ name: "purpose", value: "owner_signup" }]
    });
    if (!r.delivered) {
      console.error("[DiamondEdge] owner signup notify failed:", r.error ?? "unknown");
    }
  } catch (e) {
    console.error("[DiamondEdge] notifyOwnerNewSignup:", e);
  }
}

export async function notifyOwnerNewCommunityPost(input: {
  postId: string;
  authorEmail: string;
  authorLabel: string;
  caption: string | null;
  hasImage: boolean;
  baseUrl: string;
}): Promise<void> {
  const rawOwner = process.env.OWNER_NOTIFY_EMAIL ?? process.env.ADMIN_NOTIFY_EMAIL ?? "";
  const recipients = ownerRecipients();
  if (!recipients.length) {
    console.warn(
      `[DiamondEdge] owner community notify skipped: OWNER_NOTIFY_EMAIL empty or invalid (raw_len=${rawOwner.length}).`
    );
    return;
  }
  const cap = input.caption ? escapeHtml(input.caption) : "";
  const subjWho = escapeHtml(input.authorLabel.replace(/\r?\n/g, " ").trim()).slice(0, 120);
  try {
    const r = await sendTransactionalEmail({
      to: recipients,
      subject: `[DiamondEdge] Community post — ${subjWho}`,
      html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>New community post</h2>
        <p><strong>Author:</strong> ${escapeHtml(input.authorLabel)} (<code>${escapeHtml(input.authorEmail)}</code>)</p>
        ${cap ? `<p><strong>Caption:</strong><br>${cap.replace(/\n/g, "<br>")}</p>` : "<p><em>No caption</em></p>"}
        <p><strong>Image:</strong> ${input.hasImage ? "Yes" : "No"}</p>
        <p><a href="${input.baseUrl.replace(/\/$/, "")}/community">Open community</a></p>
      </div>
    `,
      logFallback: `owner notify community post → ${recipients.join(", ")} (${input.postId})`,
      tags: [{ name: "purpose", value: "owner_community" }]
    });
    if (!r.delivered) {
      console.error("[DiamondEdge] owner community notify failed:", r.error ?? "unknown");
    }
  } catch (e) {
    console.error("[DiamondEdge] notifyOwnerNewCommunityPost:", e);
  }
}

export async function sendVerificationEmail(email: string, verifyUrl: string): Promise<SendMailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "DiamondEdge <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[DiamondEdge] Verify (no RESEND_API_KEY) ${email}: ${verifyUrl}`);
    return { delivered: false, fallback: true };
  }

  const verifyHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Welcome to DiamondEdge Simulator</h2>
        <p>Click below to verify your email and activate your account:</p>
        <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Verify Email</a></p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p style="word-break:break-all;">${verifyUrl}</p>
      </div>
    `;

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: email.trim(),
      subject: "Verify your DiamondEdge account",
      html: verifyHtml,
      text: stripTagsForPlain(verifyHtml)
    });
    if (result.error) {
      console.error("[DiamondEdge] Resend error:", summarizeResendErr(result.error));
      return { delivered: false, fallback: true, error: result.error.message ?? "Resend rejected the send" };
    }
    if (result.data?.id) {
      console.info(`[DiamondEdge] verify mail queued ok resend_id=${result.data.id} to=${email}`);
    }
    return { delivered: true, fallback: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Email send failed";
    console.error("[DiamondEdge] sendVerificationEmail:", e);
    return { delivered: false, fallback: true, error: msg };
  }
}
