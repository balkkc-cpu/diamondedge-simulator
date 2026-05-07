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

/** Comma/semicolon-separated list; set in env (e.g. OWNER_NOTIFY_EMAIL=balkkc@gmail.com). */
function ownerRecipients(): string[] {
  const raw =
    process.env.OWNER_NOTIFY_EMAIL?.trim() ||
    process.env.ADMIN_NOTIFY_EMAIL?.trim() ||
    "";
  return raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
}

async function sendTransactionalEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  logFallback: string;
}): Promise<SendMailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "DiamondEdge <onboarding@resend.dev>";

  if (!opts.to.length) return { delivered: false, fallback: false };

  if (!apiKey) {
    console.log(`[DiamondEdge] (no RESEND_API_KEY) ${opts.logFallback}`);
    return { delivered: false, fallback: true };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html
    });
    if (error) {
      console.error("[DiamondEdge] Resend error:", error);
      return { delivered: false, fallback: true, error: error.message ?? "Resend rejected the send" };
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
  const recipients = ownerRecipients();
  if (!recipients.length) {
    console.warn("[DiamondEdge] owner signup notify skipped: OWNER_NOTIFY_EMAIL is empty");
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
      logFallback: `owner notify signup → ${recipients.join(", ")} (${newUserEmail})`
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
  const recipients = ownerRecipients();
  if (!recipients.length) {
    console.warn("[DiamondEdge] owner community notify skipped: OWNER_NOTIFY_EMAIL is empty");
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
      logFallback: `owner notify community post → ${recipients.join(", ")} (${input.postId})`
    });
    if (!r.delivered) {
      console.error("[DiamondEdge] owner community notify failed:", r.error ?? "unknown");
    }
  } catch (e) {
    console.error("[DiamondEdge] notifyOwnerNewCommunityPost:", e);
  }
}

export async function sendVerificationEmail(email: string, verifyUrl: string): Promise<SendMailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "DiamondEdge <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[DiamondEdge] Verify (no RESEND_API_KEY) ${email}: ${verifyUrl}`);
    return { delivered: false, fallback: true };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: "Verify your DiamondEdge account",
      html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Welcome to DiamondEdge Simulator</h2>
        <p>Click below to verify your email and activate your account:</p>
        <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Verify Email</a></p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p style="word-break:break-all;">${verifyUrl}</p>
      </div>
    `
    });
    if (error) {
      console.error("[DiamondEdge] Resend error:", error);
      return { delivered: false, fallback: true, error: error.message ?? "Resend rejected the send" };
    }
    return { delivered: true, fallback: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Email send failed";
    console.error("[DiamondEdge] sendVerificationEmail:", e);
    return { delivered: false, fallback: true, error: msg };
  }
}
