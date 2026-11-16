import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SharedNote } from "../../_components/shared-note";

export const metadata = {
  title: "Shared note",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Personal link from an email invite; opens only for the invited email.
export default function InvitedNotePage({ params }) {
  return (
    <Suspense fallback={<InvitedSkeleton />}>
      <SharedNote mode="invite" params={params} />
    </Suspense>
  );
}

function InvitedSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-16">
      <Skeleton className="h-9 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}
