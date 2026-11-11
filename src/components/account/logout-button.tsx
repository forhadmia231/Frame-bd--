"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div>
      <button
        className="button button-secondary"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            const result = await authClient.signOut();
            if (result.error)
              setMessage(result.error.message || "Sign out failed.");
            else {
              router.push("/login");
              router.refresh();
            }
          } catch {
            setMessage("Sign out failed. Try again.");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
