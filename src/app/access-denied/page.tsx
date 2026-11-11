import Link from "next/link";
export const metadata = { title: "Access restricted" };
export default function Page() {
  return (
    <section className="container page-content">
      <h1>Administrative access required.</h1>
      <p>
        Your current account does not have permission to enter this workspace.
      </p>
      <Link className="button button-primary" href="/">
        Return to Frame BD
      </Link>
    </section>
  );
}
