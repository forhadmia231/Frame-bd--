import Link from "next/link";
import { Logo } from "./navbar";
import { Icon } from "@/components/ui/icon";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-top">
        <div className="footer-brand">
          <Logo />
          <p>
            Stories that bring us together.
            <br />A new perspective in every frame.
          </p>
        </div>
        <div>
          <h3>Discover</h3>
          <Link href="/movies">Movies</Link>
          <Link href="/series">TV & Web Series</Link>
          <Link href="/anime">Anime</Link>
        </div>
        <div>
          <h3>Your Frame</h3>
          <Link href="/watchlist">My Watchlist</Link>
          <Link href="/plans">Membership</Link>
          <Link href="/settings">Account Settings</Link>
        </div>
        <div>
          <h3>Good to know</h3>
          <Link href="/about">About the Preview</Link>
          <Link href="/about#privacy">Privacy & Local Data</Link>
          <Link href="/api/health">
            Application Health <Icon name="arrow" size={12} />
          </Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <p>
          © {new Date().getFullYear()} Frame BD. Development preview.
        </p>
        <span>Development catalog · Authorized processed videos only.</span>
        <a href="#main">Back to top ↑</a>
      </div>
    </footer>
  );
}
