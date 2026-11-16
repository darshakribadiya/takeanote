import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SharedNote } from "../_components/shared-note";

export const metadata = {
  title: "Shared note",
  // Share links are private by obscurity; keep them out of search engines.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SharedNotePage({ params }) {
  return (
    <Suspense fallback={<SharedSkeleton />}>
      <SharedNote params={params} />
    </Suspense>
  );
}

function SharedSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-16">
      <Skeleton className="h-9 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}
