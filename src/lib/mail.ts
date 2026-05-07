import { Resend } from "resend";

export type SendMailResult = {
  delivered: boolean;
  fallback: boolean;
  error?: string;
};

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
