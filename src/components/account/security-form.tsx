"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useHydrated } from "@/lib/use-hydrated";
export function SecurityForm() {
  const ready = useHydrated();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="security-form"
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const fields = new FormData(form);
        setPending(true);
        try {
          const result = await authClient.changePassword({
            currentPassword: String(fields.get("currentPassword")),
            newPassword: String(fields.get("newPassword")),
            revokeOtherSessions: true,
          });
          setMessage(
            result.error?.message ||
              "Password changed. Other sessions have been revoked.",
          );
          if (!result.error) form.reset();
        } catch {
          setMessage("The password could not be changed.");
        } finally {
          setPending(false);
        }
      }}
    >
      <fieldset disabled={!ready || pending}>
        <label>
          Current password
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            name="newPassword"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <button className="button button-secondary" type="submit">
          {pending ? "Updating…" : "Change password"}
        </button>
        <p role="status">{message}</p>
      </fieldset>
    </form>
  );
}
