"use client";
import Link from "next/link";
import { useState } from "react";
import { useWatchlist } from "@/modules/watchlist/watchlist-provider";
import { ContentGrid } from "@/components/catalog/movie-card";
import {
  EmptyState,
  LoadingSkeleton,
  PageHeading,
  ErrorState,
} from "@/components/ui/states";
import { Icon } from "@/components/ui/icon";
import { LogoutButton } from "./logout-button";
import { useResource } from "@/lib/use-resource";
import { apiFetch } from "@/lib/api-client";
import type { CatalogTitle } from "@/types/catalog";

export function WatchlistPage() {
  const { titles: savedTitles, ready, clear, scope, error } = useWatchlist();
  const [confirm, setConfirm] = useState(false);
  const [sort, setSort] = useState("saved");
  const titles = [...savedTitles];
  if (sort === "az") titles.sort((a, b) => a.title.localeCompare(b.title));
  return (
    <div className="container page-content">
      <PageHeading
        eyebrow="YOUR PERSONAL COLLECTION"
        title="My Watchlist"
        description="A little collection of stories for another night."
      />
      <div className="integration-note">
        <Icon name="bookmark" size={18} />
        <span>
          {scope === "account"
            ? "Saved to your signed-in account and synchronized with PostgreSQL."
            : "Guest list saved in this browser. Sign in to use a separate account watchlist."}{" "}
          Saving a title does not grant premium access.
        </span>
      </div>
      {!ready ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorState
          title="Your watchlist could not load."
          description={error}
        />
      ) : titles.length ? (
        <>
          <div className="library-toolbar">
            <p>
              {titles.length} saved {titles.length === 1 ? "story" : "stories"}
            </p>
            <label>
              Sort{" "}
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="saved">Recently saved</option>
                <option value="az">Title A–Z</option>
              </select>
            </label>
            <button
              className="text-button"
              onClick={() => setConfirm(!confirm)}
            >
              <Icon name="trash" size={15} />
              Clear list
            </button>
          </div>
          {confirm && (
            <div className="confirmation">
              <p>Remove every title from your {scope} watchlist?</p>
              <button
                className="button button-primary button-small"
                onClick={() => {
                  clear();
                  setConfirm(false);
                }}
              >
                Clear watchlist
              </button>
              <button
                className="button button-secondary button-small"
                onClick={() => setConfirm(false)}
              >
                Keep my list
              </button>
            </div>
          )}
          <ContentGrid titles={titles} />
        </>
      ) : (
        <EmptyState
          title="Your list. Your kind of stories."
          description="Tap the + on any title to save it here for later."
          icon="bookmark"
        />
      )}
    </div>
  );
}
export function ProfilePage({
  user,
}: {
  user: { id: string; name: string; email: string; role: string };
}) {
  const { saved } = useWatchlist();
  const { data, error } = useResource<{ membership: string }>(
    "me/profile",
    user.id,
  );
  return (
    <div className="container page-content account-page">
      <PageHeading
        eyebrow="YOUR FRAME BD"
        title="Your space"
        description="All your stories, together in one place."
      />
      <div className="profile-banner">
        <div className="profile-avatar">
          <Icon name="user" size={40} />
        </div>
        <div>
          <h2>Welcome, {user.name}.</h2>
          <p>{user.email}</p>
          <span className="badge-neutral">
            {!data
              ? "Checking membership…"
              : data.membership === "PREMIUM"
                ? "Premium member"
                : "Free member"}{" "}
            · {user.role}
          </span>
        </div>
        <LogoutButton />
      </div>
      {error && <p role="alert">{error}</p>}
      {["ADMIN", "SUPER_ADMIN"].includes(user.role) && (
        <Link href="/admin" className="button button-primary">
          Open administration
        </Link>
      )}
      <div className="account-tiles">
        {[
          {
            href: "/watchlist",
            icon: "bookmark" as const,
            title: "My Watchlist",
            text: `${saved.length} titles saved to your account`,
          },
          {
            href: "/history",
            icon: "clock" as const,
            title: "Watch History",
            text: "Your private viewing history",
          },
          {
            href: "/continue-watching",
            icon: "play" as const,
            title: "Continue Watching",
            text: "Pick up where you left off",
          },
          {
            href: "/plans",
            icon: "crown" as const,
            title: "Membership",
            text: "Plans and subscription information",
          },
          {
            href: "/profile/edit",
            icon: "user" as const,
            title: "Edit Profile",
            text: "Update your name and bio",
          },
          {
            href: "/settings",
            icon: "settings" as const,
            title: "Account Settings",
            text: "Security and playback preferences",
          },
        ].map((item) => (
          <Link href={item.href} key={item.href}>
            <Icon name={item.icon} size={24} />
            <h3>{item.title}</h3>
            <p>{item.text}</p>
            <Icon name="arrow" size={17} />
          </Link>
        ))}
      </div>
    </div>
  );
}
export type ViewingItem = {
  id: string;
  episodeKey: string;
  position?: number;
  duration?: number;
  updatedAt: string;
  title: CatalogTitle | null;
};
export function ViewingLibrary({
  history = false,
  userId,
}: {
  history?: boolean;
  userId: string;
}) {
  const { data, error, loading, reload } = useResource<ViewingItem[]>(
    history ? "me/history" : "me/continue-watching",
    userId,
  );
  const [message, setMessage] = useState("");
  return (
    <div className="container page-content">
      <PageHeading
        eyebrow="YOUR VIEWING JOURNEY"
        title={history ? "Watch History" : "Continue Watching"}
        description={
          history
            ? "The stories you have spent time with."
            : "A good story deserves to be finished."
        }
      />
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorState
          title="Your viewing data could not load."
          description={error}
          retry={reload}
        />
      ) : data?.length ? (
        <div className="viewing-grid">
          {data
            .filter((item) => item.title)
            .map((item) => (
              <article key={item.id} className="continue-empty">
                <div>
                  <h2>
                    <Link
                      href={`/watch/${item.title!.slug}${item.episodeKey ? `?episode=${item.episodeKey}` : ""}`}
                    >
                      {item.title!.title}
                    </Link>
                  </h2>
                  <p>
                    {item.episodeKey?.toUpperCase() || "Movie"}{" "}
                    {item.position !== undefined &&
                      `· ${Math.floor(item.position / 60)}m / ${Math.floor((item.duration || 0) / 60)}m`}
                  </p>
                  {item.position !== undefined && (
                    <progress
                      aria-label="Viewing progress"
                      value={item.position}
                      max={item.duration}
                    />
                  )}
                </div>
                <Link
                  className="button button-primary"
                  href={`/watch/${item.title!.slug}${item.episodeKey ? `?episode=${item.episodeKey}` : ""}`}
                >
                  Resume
                </Link>
                {history && (
                  <button
                    className="text-button"
                    onClick={async () => {
                      try {
                        await apiFetch(`me/history/${item.id}`, {
                          method: "DELETE",
                        });
                        reload();
                      } catch (error) {
                        setMessage(
                          error instanceof Error
                            ? error.message
                            : "Could not remove history.",
                        );
                      }
                    }}
                  >
                    Remove from history
                  </button>
                )}
              </article>
            ))}
        </div>
      ) : (
        <EmptyState
          title={
            history
              ? "A fresh viewing journey."
              : "Your next chapter starts here."
          }
          description="Your account has no saved viewing activity. The player will report progress when licensed streaming is connected."
          icon={history ? "clock" : "play"}
        />
      )}
      <p role="status">{message}</p>
    </div>
  );
}
