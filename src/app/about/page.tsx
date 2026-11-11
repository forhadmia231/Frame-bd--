import Link from "next/link";
import { PageHeading } from "@/components/ui/states";
export const metadata = { title: "About the preview" };
export default function AboutPage() {
  return (
    <div className="container page-content prose-page">
      <PageHeading
        eyebrow="BEHIND THE FRAME"
        title="A new home for stories"
        description="Frame BD · Secure adaptive streaming development build"
      />
      <section>
        <h2>Built for the stories ahead.</h2>
        <p>
          This preview explores the planned Frame BD experience: discovering
          movies and series, finding a new genre and saving something for
          another night. All titles, names, ratings and release metadata are
          fictional development data, not available films.
        </p>
        <p>
          Accounts and private user data are connected to PostgreSQL. Only
          titles with ready, authorized processed videos can stream. The
          Streaming Lab uses an original generated test pattern; other fictional
          titles have no video unless an authorized asset is added. Payment
          checkout remains unavailable.
        </p>
      </section>
      <section id="privacy">
        <h2>Your data in this preview</h2>
        <p>
          Guest watchlists and preferences are stored in this browser. Signed-in
          profiles, lists and activity are stored in the database and scoped to
          the authenticated user. Passwords are hashed by Better Auth; sessions
          use HttpOnly cookies. Email verification is required.
        </p>
        <p>
          Clear your browser watchlist in{" "}
          <Link href="/settings">Account Settings</Link>. Use test values when
          reviewing local development forms. Local SMTP mode saves verification
          and reset emails only to the project&apos;s private local inbox,
          without internet delivery.
        </p>
      </section>
      <section>
        <h2>Artwork</h2>
        <p>
          Original typographic poster layouts use landscape photographs
          downloaded from Unsplash for local development. Images do not
          represent real films or imply endorsement. View the{" "}
          <a
            href="https://unsplash.com/license"
            target="_blank"
            rel="noreferrer"
          >
            Unsplash license
          </a>
          . Individual asset source URLs are recorded in the project artwork
          credits.
        </p>
      </section>
      <Link href="/" className="button button-primary">
        Back to the collection
      </Link>
    </div>
  );
}
