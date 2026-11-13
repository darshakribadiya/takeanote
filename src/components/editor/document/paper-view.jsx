"use client";

import { useEffect, useRef, useState } from "react";
import { PAGE_GAP_PX } from "@/lib/editor/paper";
import { cn } from "@/lib/utils";

/*
 * Lays out the paper: a stack of sheets drawn behind one continuous
 * writing surface. Sheet heights come from the pagination plugin, so the
 * sheets line up with the page-break spacers inside the editor.
 *
 * `reflow` (phones) drops the fixed page width: the text fills the screen
 * with small margins, while the paper settings stay untouched.
 */
export function PaperView({ paper, metrics, pages, scale, reflow, children }) {
  const flowRef = useRef(null);
  const [flowHeight, setFlowHeight] = useState(metrics.height);
  const paged = paper.layout === "paged" && !reflow;

  useEffect(() => {
    const flow = flowRef.current;
    if (!flow) return;
    const observer = new ResizeObserver(() => setFlowHeight(flow.offsetHeight));
    observer.observe(flow);
    return () => observer.disconnect();
  }, []);

  const margin = reflow ? 20 : metrics.margin;
  const sheets = paged
    ? pages.map((page) => Math.max(metrics.height, Math.ceil(page.used) + margin * 2))
    : [Math.max(reflow ? 0 : metrics.height, flowHeight)];
  const totalHeight = sheets.reduce((sum, height) => sum + height, 0) + PAGE_GAP_PX * (sheets.length - 1);
  const width = reflow ? "100%" : metrics.width;

  const style = {
    "--paper-margin": `${margin}px`,
    "--paper-line-height": paper.lineHeight,
    "--paper-line": `${paper.lineHeight}em`,
    "--page-gap": `${PAGE_GAP_PX}px`,
  };

  return (
    <div
      className={cn("relative mx-auto", reflow && "w-full")}
      style={reflow ? undefined : { width: metrics.width * scale, height: totalHeight * scale }}
    >
      <div
        className={cn("paper", !reflow && "absolute top-0 left-0 origin-top-left")}
        data-layout={paged ? "paged" : "continuous"}
        data-pattern={paper.pattern}
        style={{ ...style, width, transform: reflow || scale === 1 ? undefined : `scale(${scale})` }}
      >
        <div aria-hidden="true" className="paper-sheets">
          {sheets.map((height, index) => (
            <Sheet
              footer={paper.footer}
              header={paper.header}
              height={height}
              index={index}
              key={index}
              pageNumbers={paged && paper.pageNumbers}
              showChrome={!reflow}
              top={sheets.slice(0, index).reduce((sum, value) => sum + value + PAGE_GAP_PX, 0)}
              total={sheets.length}
            />
          ))}
        </div>
        <div className="paper-flow" ref={flowRef} style={{ padding: margin }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Sheet({ top, height, index, total, header, footer, pageNumbers, showChrome }) {
  return (
    <div className="paper-sheet" style={{ top, height }}>
      <div className="paper-pattern" />
      {showChrome && header && <div className="paper-header">{header}</div>}
      {showChrome && (footer || pageNumbers) && (
        <div className="paper-footer">
          <span className="min-w-0 truncate">{footer}</span>
          {pageNumbers && (
            <span className="shrink-0 tabular-nums">
              {index + 1} / {total}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
