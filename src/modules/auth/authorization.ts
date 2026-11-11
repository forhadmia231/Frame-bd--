import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { getDb } from "@/lib/db";

export async function currentUser(request?: Request) {
  const session = await getAuth().api.getSession({
    headers: request?.headers || (await headers()),
  });
  if (!session) return null;
  // Read current authorization from the database, never a cached browser role.
  return getDb().user.findFirst({
    where: { id: session.user.id, suspendedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      role: true,
      image: true,
    },
  });
}
export async function requireUser(request: Request) {
  const user = await currentUser(request);
  if (!user)
    throw new ApiError(401, "UNAUTHENTICATED", "Please sign in to continue.");
  if (!user.emailVerified)
    throw new ApiError(
      403,
      "EMAIL_UNVERIFIED",
      "Verify your email before continuing.",
    );
  return user;
}
export async function requirePageUser() {
  const user = await currentUser();
  if (!user || !user.emailVerified) redirect("/login");
  return user;
}
export async function requireRole(request: Request, roles: string[]) {
  const user = await requireUser(request);
  if (!roles.includes(user.role))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "You do not have permission for this action.",
    );
  return user;
}
export { rolePermissions } from "./permissions";
