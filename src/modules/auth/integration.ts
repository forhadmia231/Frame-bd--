"use client";
import { authClient } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api-client";
export type AccountOperation =
  | "login"
  | "register"
  | "forgot-password"
  | "reset-password"
  | "edit-profile";
export type AccountInput = {
  name?: string;
  email?: string;
  password?: string;
  token?: string;
  bio?: string;
};
export async function requestAccountOperation(
  operation: AccountOperation,
  input: AccountInput,
): Promise<{ ok: boolean; message: string; redirect?: string }> {
  if (operation === "edit-profile") {
    await apiFetch("me/profile", {
      method: "PATCH",
      body: JSON.stringify({ name: input.name, bio: input.bio || "" }),
    });
    return { ok: true, message: "Profile saved.", redirect: "/profile" };
  }
  const response =
    operation === "login"
      ? await authClient.signIn.email({
          email: input.email!,
          password: input.password!,
        })
      : operation === "register"
        ? await authClient.signUp.email({
            name: input.name!,
            email: input.email!,
            password: input.password!,
            callbackURL: "/login",
          })
        : operation === "forgot-password"
          ? await authClient.requestPasswordReset({
              email: input.email!,
              redirectTo: `${location.origin}/reset-password`,
            })
          : await authClient.resetPassword({
              token: input.token!,
              newPassword: input.password!,
            });
  if (response.error)
    return {
      ok: false,
      message: response.error.message || "This request could not be completed.",
    };
  return operation === "login"
    ? { ok: true, message: "Signed in.", redirect: "/profile" }
    : operation === "register"
      ? {
          ok: true,
          message:
            "If this address is eligible, check the verification email. You must verify before signing in.",
        }
      : operation === "forgot-password"
        ? {
            ok: true,
            message:
              "If a matching account exists, a recovery email has been requested. Check the configured inbox.",
          }
        : {
            ok: true,
            message: "Password reset. Sign in with your new password.",
            redirect: "/login",
          };
}
