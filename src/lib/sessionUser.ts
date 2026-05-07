import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { USER_COOKIE_NAME, verifyUserSession } from "@/lib/userAuth";

export async function getSessionUser() {
  const token = cookies().get(USER_COOKIE_NAME)?.value;
  const v = verifyUserSession(token);
  if (!v.valid) return null;
  return prisma.user.findUnique({ where: { email: v.email } });
}
