import { Skeleton } from "@/components/ui/skeleton";

// Same three-pane shape as the workspace so the first paint does not jump.
export function WorkspaceSkeleton() {
  return (
    <div aria-busy="true" className="flex h-dvh w-full">
      <div className="hidden w-64 shrink-0 flex-col gap-3 border-r bg-sidebar p-3 md:flex">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="mt-4 h-6 w-40" />
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-6 w-28" />
      </div>
      <div className="flex w-full shrink-0 flex-col gap-4 border-r p-4 md:w-80">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 6 }, (_, index) => (
          <div className="flex flex-col gap-2" key={index}>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="hidden flex-1 flex-col gap-4 p-10 md:flex">
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}
