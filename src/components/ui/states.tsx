import Link from "next/link";
import { Icon, type IconName } from "./icon";

export function EmptyState({
  title,
  description,
  href = "/categories",
  action = "Explore the catalog",
  icon = "compass",
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
  icon?: IconName;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name={icon} size={30} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link href={href} className="button button-primary">
        {action}
        <Icon name="arrow" size={17} />
      </Link>
    </div>
  );
}
export function ErrorState({
  title,
  description,
  retry,
}: {
  title: string;
  description: string;
  retry?: () => void;
}) {
  return (
    <div className="empty-state" role="alert">
      <div className="empty-icon">
        <Icon name="info" size={30} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {retry && (
        <button className="button button-primary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function LoadingSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="content-grid"
      role="status"
      aria-label="Loading titles"
      aria-busy="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-card" key={index}>
          <div className="skeleton skeleton-poster" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
        </div>
      ))}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>
          {title}
          <span className="red-dot">.</span>
        </h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
