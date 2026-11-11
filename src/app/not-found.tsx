import { EmptyState } from "@/components/ui/states";
export default function NotFound() {
  return (
    <div className="container page-content">
      <EmptyState
        icon="film"
        title="This story is off the map."
        description="The page or title you are looking for does not exist in this preview."
        href="/"
        action="Return home"
      />
    </div>
  );
}
