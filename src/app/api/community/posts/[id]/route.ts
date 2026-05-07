import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Public read for one post (image data for display). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const p = await prisma.communityPost.findUnique({
    where: { id: params.id },
    include: { user: { select: { email: true, displayName: true } } }
  });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const author = p.user.displayName || p.user.email.split("@")[0]?.slice(0, 12) || "member";
  return NextResponse.json({
    id: p.id,
    caption: p.caption,
    imageUrl: p.imageUrl,
    imageData: p.imageData,
    createdAt: p.createdAt,
    author
  });
}
