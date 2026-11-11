"use client";
import { ErrorState } from "@/components/ui/states";
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container page-content">
      <ErrorState
        title="This frame needs another take."
        description="Something went wrong loading this page. Please try again."
        retry={reset}
      />
    </div>
  );
}
