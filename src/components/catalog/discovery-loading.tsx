import { LoadingSkeleton } from "@/components/ui/states";
export default function DiscoveryLoading() {
  return (
    <div className="container page-content">
      <div className="skeleton skeleton-heading" />
      <LoadingSkeleton count={12} />
    </div>
  );
}
