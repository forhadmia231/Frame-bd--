"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useHydrated } from "@/lib/use-hydrated";
import { apiFetch } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import {
  requestAccountOperation,
  type AccountOperation,
} from "@/modules/auth/integration";

export function AccountForm({
  mode,
  token = "",
  initialName = "",
  initialBio = "",
}: {
  mode: AccountOperation;
  token?: string;
  initialName?: string;
  initialBio?: string;
}) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [delivery, setDelivery] = useState<{
    emailConfigured: boolean;
    emailMode: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    apiFetch<{ emailConfigured: boolean; emailMode: string }>("status")
      .then((result) => {
        if (active) setDelivery(result.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const titles = {
    login: ["Welcome back.", "Your next great story is waiting.", "Sign in"],
    register: [
      "Your story starts here.",
      "Create an account and verify your email.",
      "Create account",
    ],
    "forgot-password": [
      "A fresh start.",
      "Request a secure recovery link for your account.",
      "Request reset link",
    ],
    "reset-password": [
      "Choose a new password.",
      "Reset links are time-limited and can be used once.",
      "Reset password",
    ],
    "edit-profile": [
      "Make it yours.",
      "Manage the profile attached to your signed-in account.",
      "Save profile",
    ],
  };
  const [title, description, action] = titles[mode];
  return (
    <div className="account-layout container">
      <div className="account-story">
        <p className="eyebrow">A WORLD WITHIN YOUR REACH</p>
        <h2>
          Every mood.
          <br />
          Every moment.
          <br />
          <span>Every frame.</span>
        </h2>
        <p>A home for the stories that move you.</p>
        <span className="account-story-line" />
      </div>
      <section className="account-form-panel">
        <span className="form-symbol">
          <Icon name={mode === "forgot-password" ? "mail" : "user"} size={24} />
        </span>
        <h1>{title}</h1>
        <p>{description}</p>
        {mode !== "edit-profile" && (
          <div className="integration-note">
            <Icon name="info" size={17} />
            <span>
              {!delivery
                ? "Checking email delivery configuration…"
                : !delivery.emailConfigured
                  ? "Verification and recovery await email configuration."
                  : delivery.emailMode === "local"
                    ? "Local development: email is delivered only to the project SMTP inbox. It does not reach your internet email account. See setup instructions."
                    : "Email verification is required. Use your own email address."}
            </span>
          </div>
        )}
        <form
          method="post"
          onSubmit={async (event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            setPending(true);
            setMessage("");
            try {
              const result = await requestAccountOperation(mode, {
                name: String(fields.get("name") || ""),
                email,
                password: String(fields.get("password") || ""),
                token,
                bio: String(fields.get("bio") || ""),
              });
              setMessage(result.message);
              if (result.redirect) {
                router.push(result.redirect);
                router.refresh();
              }
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "The request could not be completed.",
              );
            } finally {
              setPending(false);
            }
          }}
        >
          <fieldset disabled={!hydrated || pending}>
            {(mode === "register" || mode === "edit-profile") && (
              <label htmlFor="display-name">
                Display name
                <input
                  id="display-name"
                  name="name"
                  defaultValue={initialName}
                  required
                  minLength={2}
                  maxLength={60}
                  autoComplete="nickname"
                  placeholder="Your name"
                />
              </label>
            )}
            {mode !== "reset-password" && mode !== "edit-profile" && (
              <label htmlFor="account-email">
                Email address
                <input
                  id="account-email"
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            )}
            {(mode === "login" ||
              mode === "register" ||
              mode === "reset-password") && (
              <label htmlFor="account-password">
                Password
                <div className="password-field">
                  <input
                    id="account-password"
                    name="password"
                    required
                    minLength={mode === "login" ? 1 : 12}
                    maxLength={128}
                    type={visible ? "text" : "password"}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    placeholder={
                      mode === "login"
                        ? "Your password"
                        : "At least 12 characters"
                    }
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={visible ? "Hide password" : "Show password"}
                    aria-pressed={visible}
                    onClick={() => setVisible(!visible)}
                  >
                    <Icon name="eye" size={19} />
                  </button>
                </div>
              </label>
            )}
            {mode === "edit-profile" && (
              <label>
                Bio
                <input
                  name="bio"
                  defaultValue={initialBio}
                  maxLength={500}
                  placeholder="A little about you"
                />
              </label>
            )}
            {mode === "login" && (
              <div className="form-options">
                <Link href="/forgot-password">Forgot password?</Link>
              </div>
            )}
            {mode === "register" && (
              <p className="fine-print">
                An account does not provide premium membership. Payments and
                streaming are not available yet.
              </p>
            )}
            <button
              type="submit"
              className="button button-primary form-submit"
              disabled={pending || (mode === "reset-password" && !token)}
            >
              {pending ? "Please wait…" : action}
              <Icon name="arrow" size={18} />
            </button>
            {mode === "login" && (
              <button
                type="button"
                className="text-button"
                disabled={pending || !email}
                onClick={async () => {
                  setPending(true);
                  try {
                    const response = await authClient.sendVerificationEmail({
                      email,
                      callbackURL: "/login",
                    });
                    setMessage(
                      response.error?.message ||
                        "If this address needs verification, check the configured inbox.",
                    );
                  } catch {
                    setMessage("Verification could not be requested.");
                  } finally {
                    setPending(false);
                  }
                }}
              >
                Resend verification email
              </button>
            )}
            <p className="form-status" role="status" aria-live="polite">
              {message || (mode === "reset-password" && !token)
                ? message || "Open the reset link from your email to continue."
                : message}
            </p>
          </fieldset>
        </form>
        <div className="form-bottom">
          {mode === "login" ? (
            <>
              New to Frame BD? <Link href="/register">Create an account</Link>
            </>
          ) : (
            <Link href={mode === "edit-profile" ? "/profile" : "/login"}>
              {mode === "edit-profile" ? "Back to profile" : "Back to sign in"}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
