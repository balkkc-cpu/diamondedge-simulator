import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionUser";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

const MAX_IMAGE_CHARS = 340_000;
const MAX_CAPTION = 500;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const take = Math.min(50, Math.max(1, Number(searchParams.get("take") ?? 30)));
  const rows = await prisma.communityPost.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { user: { select: { email: true, displayName: true } } }
  });
  return NextResponse.json({
    posts: rows.map((p: (typeof rows)[number]) => ({
      id: p.id,
      caption: p.caption,
      imageUrl: p.imageUrl,
      imageData: p.imageData,
      createdAt: p.createdAt,
      author: p.user.displayName || maskEmail(p.user.email)
    }))
  });
}

function maskEmail(email: string) {
  const [a, d] = email.split("@");
  if (!d) return "member";
  return `${a.slice(0, 2)}…@${d}`;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`community:${ip}`, 15, 60_000).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const user = await getSessionUser();
  if (!user?.emailVerified) {
    return NextResponse.json({ error: "Verify your email before posting." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const caption = body.caption != null ? String(body.caption).slice(0, MAX_CAPTION) : null;
  const imageUrl = body.imageUrl != null ? String(body.imageUrl).slice(0, 2000) : null;
  let imageData = body.imageData != null ? String(body.imageData) : null;
  if (imageData && !imageData.startsWith("data:image/")) {
    return NextResponse.json({ error: "Images must be data URLs (jpeg/png/webp)." }, { status: 400 });
  }
  if (imageData && imageData.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ error: "Image too large (max ~350KB compressed)." }, { status: 400 });
  }
  if (!caption && !imageUrl && !imageData) {
    return NextResponse.json({ error: "Add a caption and/or an image." }, { status: 400 });
  }

  const post = await prisma.communityPost.create({
    data: {
      userId: user.id,
      caption: caption || null,
      imageUrl: imageUrl || null,
      imageData: imageData || null
    }
  });
  return NextResponse.json({ ok: true, id: post.id });
}
