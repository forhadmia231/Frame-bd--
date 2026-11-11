import "server-only";
import { redirect } from "next/navigation";
import { currentUser, requireRole } from "@/modules/auth/authorization";
import { ApiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
export async function adminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.emailVerified || !["ADMIN", "SUPER_ADMIN"].includes(user.role))
    redirect("/access-denied");
  return user;
}
export async function adminRequest(request: Request, superOnly = false) {
  const user = await requireRole(
    request,
    superOnly ? ["SUPER_ADMIN"] : ["ADMIN", "SUPER_ADMIN"],
  );
  await rateLimit(
    `admin:${user.id}:${request.method === "GET" ? "read" : "write"}`,
    request.method === "GET" ? 300 : 60,
    60,
  );
  return user;
}
export function superAdmin(role: string) {
  if (role !== "SUPER_ADMIN")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Only a Super Admin can perform this action.",
    );
}
