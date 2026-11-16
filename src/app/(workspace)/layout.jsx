import { Suspense } from "react";
import { Workspace } from "./_components/workspace";
import { WorkspaceSkeleton } from "./_components/workspace-skeleton";

// Signed-in notes are private; search engines get the landing page at "/" instead.
export const metadata = { robots: { index: false, follow: false } };

/*
 * The workspace is one persistent client app: switching notes changes the
 * URL (/n/<id>) without remounting the sidebar, list or realtime channel.
 *
 * Pages under this layout render nothing. `children` stays outside the
 * browser-only boundary so Next can still render (and validate) the page
 * segment while the workspace itself waits for the browser.
 */
export default function WorkspaceLayout({ children }) {
  return (
    <>
      <Suspense fallback={<WorkspaceSkeleton />}>
        <Workspace />
      </Suspense>
      {children}
    </>
  );
}
