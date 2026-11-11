"use client";

import Link from "next/link";
import { useState } from "react";
import { useWatchlist } from "@/modules/watchlist/watchlist-provider";
import { PageHeading } from "@/components/ui/states";
import { useBrowserStorage } from "@/lib/browser-storage";
import { authClient } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api-client";
import { useResource } from "@/lib/use-resource";
import { SecurityForm } from "./security-form";

export function AccountSettings() {
  const { data: session } = authClient.useSession();
  const preference = useResource<{ subtitleLanguage: string }>(
    "me/preferences",
    session?.user.id || "guest",
    !!session,
  );
  const { clear } = useWatchlist();
  const [confirm, setConfirm] = useState(false);
  const storage = useBrowserStorage("frame-bd:subtitle-language", "English");
  const [draft, setLanguage] = useState<string | undefined>();
  const language =
    draft ??
    preference.data?.subtitleLanguage ??
    (storage.value === "Bangla" || storage.value === "Off"
      ? storage.value
      : "English");
  const [message, setMessage] = useState("");
  return (
    <div className="container page-content account-page">
      <PageHeading
        eyebrow="A LITTLE MORE PERSONAL"
        title="Account Settings"
        description="Fine-tune your corner of Frame BD."
      />
      <div className="settings-panel">
        <section>
          <h2>Account & security</h2>
          <p>
            {session
              ? "You are signed in. Password changes revoke other active sessions."
              : "Sign in to manage account security. Guest preferences remain in this browser."}
          </p>
          {session ? (
            <SecurityForm />
          ) : (
            <Link className="button button-secondary" href="/login">
              Go to sign in
            </Link>
          )}
        </section>
        <section>
          <h2>Playback preferences</h2>
          <p>
            {session
              ? "Preferences are stored with your account."
              : "Save a preference in this browser."}{" "}
            The player will use this setting when licensed streaming is
            integrated.
          </p>
          <label>
            Preferred subtitle language
            <select
              disabled={!storage.ready}
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option>English</option>
              <option>Bangla</option>
              <option>Off</option>
            </select>
          </label>
          <button
            className="button button-secondary"
            disabled={!storage.ready}
            onClick={async () => {
              try {
                if (session) {
                  await apiFetch("me/preferences", {
                    method: "PATCH",
                    body: JSON.stringify({ subtitleLanguage: language }),
                  });
                  setMessage("Preference saved to your account.");
                } else
                  setMessage(
                    storage.write(language)
                      ? "Subtitle preference saved in this browser."
                      : "Browser storage is unavailable. Preference lasts for this visit only.",
                  );
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Preference could not be saved.",
                );
              }
            }}
          >
            Save preference
          </button>
          <p role="status">{message}</p>
        </section>
        <section>
          <h2>{session ? "Account watchlist" : "Browser data"}</h2>
          <p>
            {session
              ? "Clearing your account watchlist removes its saved titles from the database."
              : "Your guest watchlist is stored in this browser and is separate from any account list."}
          </p>
          {!confirm ? (
            <button
              className="button button-danger"
              onClick={() => setConfirm(true)}
            >
              Clear {session ? "account" : "browser"} watchlist
            </button>
          ) : (
            <div className="confirmation">
              <p>Clear all saved titles?</p>
              <button
                className="button button-danger"
                onClick={() => {
                  clear();
                  setConfirm(false);
                }}
              >
                Yes, clear list
              </button>
              <button
                className="button button-secondary"
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
