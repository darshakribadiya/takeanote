"use client";

import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DEFAULT_PAPER, pageMetrics } from "@/lib/editor/paper";
import { cn } from "@/lib/utils";
import { PaperView } from "./paper-view";

const TITLE_GAP_PX = 16;

/*
 * An empty sheet laid out exactly like DocumentEditor (same desk, paper
 * size, margins, fit-to-width zoom and padding), so the home screen and a
 * loading note look like the document that replaces them.
 * `title` / `body` are what goes on the page; empty for a plain sheet.
 * `animate` fades the sheet in (home screen only, so a loading note doesn't flash).
 */
export function BlankPaper({ title, body, className, animate = false }) {
  const scrollRef = useRef(null);
  const metrics = pageMetrics(DEFAULT_PAPER);
  const isPhone = useMediaQuery("max-md");
  const [availableWidth, setAvailableWidth] = useState(metrics.width + 48);

  useEffect(() => {
    const target = scrollRef.current;
    if (!target) return;
    const observer = new ResizeObserver(() => setAvailableWidth(target.clientWidth));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // Same rule as DocumentEditor's "fit" zoom.
  const scale = isPhone ? 1 : Math.min(1, Math.max(0.3, (availableWidth - 48) / metrics.width));

  return (
    <div className={cn("paper-desk min-h-0 flex-1 overflow-y-auto overscroll-contain", className)} ref={scrollRef}>
      <div className={cn("px-0 pt-4 pb-28 md:px-6 md:pt-8", animate && "paper-enter")}>
        <PaperView metrics={metrics} pages={[{ used: 0 }]} paper={DEFAULT_PAPER} reflow={isPhone} scale={scale}>
          <div style={{ marginBottom: TITLE_GAP_PX }}>{title}</div>
          {body}
        </PaperView>
      </div>
    </div>
  );
}
