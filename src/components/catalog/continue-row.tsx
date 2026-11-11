"use client";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { authClient } from "@/lib/auth-client";
import { useResource } from "@/lib/use-resource";
import type { ViewingItem } from "@/components/account/library";

export function ContinueWatchingRow() {
  const { data: session } = authClient.useSession();
  const { data } = useResource<ViewingItem[]>(
    "me/continue-watching",
    session?.user.id || "guest",
    !!session,
  );
  return (
    <section className="content-section">
      <div className="row-heading">
        <h2>Continue Watching</h2>
        <Link className="text-link" href="/continue-watching">
          View all <Icon name="right" size={14} />
        </Link>
      </div>
      {data?.length ? (
        <div className="content-row wide-row">
          {data
            .filter((item) => item.title)
            .map((item) => (
              <div className="continue-empty" key={item.id}>
                <div>
                  <h3>{item.title!.title}</h3>
                  <p>{Math.floor((item.position || 0) / 60)} minutes watched</p>
                  <Link
                    className="text-link"
                    href={`/watch/${item.title!.slug}${item.episodeKey ? `?episode=${item.episodeKey}` : ""}`}
                  >
                    Resume story →
                  </Link>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="continue-empty">
          <div className="continue-symbol">
            <Icon name="play" size={24} />
          </div>
          <div>
            <h3>Your next chapter is waiting.</h3>
            <p>
              {session
                ? "Your account has no unfinished stories yet."
                : "Sign in to synchronize viewing progress across devices."}
            </p>
          </div>
          <Link href="/movies" className="button button-secondary">
            Find your next watch <Icon name="arrow" size={16} />
          </Link>
        </div>
      )}
    </section>
  );
}
