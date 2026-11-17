"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Slider } from "@/components/ui/slider";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PAPER_SIZES, paperLabel, PATTERNS } from "@/lib/editor/paper";
import { useFocusMode } from "@/hooks/use-focus-mode";
import { setFocusDim, toggleFocusMode } from "@/lib/focus-mode";
import { isMac } from "@/lib/format";
import { cn } from "@/lib/utils";

export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];
// Slider ranges; margins in mm, line spacing as a multiple of the font size.
const MARGIN_RANGE = { min: 5, max: 50, step: 0.5 };
const LINE_HEIGHT_RANGE = { min: 1, max: 3, step: 0.05 };

/*
 * Floating pill in the corner of the paper: zoom, fit and the paper
 * settings popover. Everything is optional and out of the way.
 */
export function PaperControls({
  paper,
  setPaper,
  scale,
  zoom,
  setZoom,
  reflow,
  onTogglePreview,
  isPhone,
  words,
  readOnly,
  outlineOpen,
  onToggleOutline,
  findOpen,
  onFind,
  commentsOpen,
  commentCount,
  onToggleComments,
}) {
  const mod = isMac() ? "⌘" : "Ctrl+";
  const focus = useFocusMode();
  function step(direction) {
    const index = ZOOM_STEPS.findIndex((value) => value >= scale - 0.001);
    const next = direction > 0 ? ZOOM_STEPS.find((value) => value > scale + 0.001) : [...ZOOM_STEPS].reverse().find((value) => value < scale - 0.001);
    setZoom(next ?? ZOOM_STEPS[Math.max(0, Math.min(index, ZOOM_STEPS.length - 1))]);
  }

  return (
    <div className="paper-controls pointer-events-auto flex items-center gap-0.5 rounded-xl border bg-popover/92 p-1 text-sm shadow-lg/5 backdrop-blur">
      <span className="px-2 text-xs text-muted-foreground tabular-nums max-sm:hidden" title="Words">
        {words.toLocaleString()} {words === 1 ? "word" : "words"}
      </span>
      {isPhone ? (
        <PillButton label={reflow ? "Show page layout" : "Fit text to screen"} onClick={onTogglePreview}>
          <Icon icon={reflow ? "mdi:file-document-outline" : "mdi:cellphone-text"} />
        </PillButton>
      ) : (
        <>
          <PillButton disabled={scale <= ZOOM_STEPS[0]} label="Zoom out (Ctrl -)" onClick={() => step(-1)}>
            <Icon icon="mdi:minus" />
          </PillButton>
          <button
            className="h-8 min-w-12 rounded-md px-1 text-xs tabular-nums hover:bg-accent"
            onClick={() => setZoom(zoom === "fit" ? 1 : "fit")}
            title={zoom === "fit" ? "Fit to screen · click for 100%" : "Click to fit to screen"}
            type="button"
          >
            {zoom === "fit" ? "Fit" : `${Math.round(scale * 100)}%`}
          </button>
          <PillButton disabled={scale >= ZOOM_STEPS.at(-1)} label="Zoom in (Ctrl +)" onClick={() => step(1)}>
            <Icon icon="mdi:plus" />
          </PillButton>
        </>
      )}
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
      {focus.active && (
        <PillButton active={focus.dim} label="Dim other paragraphs" onClick={() => setFocusDim(!focus.dim)}>
          <Icon icon="mdi:format-paragraph" />
        </PillButton>
      )}
      <PillButton
        active={focus.active}
        label={`${focus.active ? "Exit focus mode" : "Focus mode"} (${mod}Shift+F)`}
        onClick={toggleFocusMode}
      >
        <Icon icon={focus.active ? "mdi:fullscreen-exit" : "mdi:fullscreen"} />
      </PillButton>
      <PillButton active={outlineOpen} label="Outline" onClick={onToggleOutline}>
        <Icon icon="mdi:format-list-text" />
      </PillButton>
      <PillButton active={findOpen} label={`Find & replace (${mod}F)`} onClick={onFind}>
        <Icon icon="mdi:magnify" />
      </PillButton>
      <PillButton active={commentsOpen} label="Comments" onClick={onToggleComments}>
        <span className="relative">
          <Icon className="size-4.5" icon="mdi:comment-outline" />
          {commentCount > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-primary px-1 text-center text-[0.625rem] leading-4 font-semibold text-primary-foreground tabular-nums">
              {commentCount > 99 ? "99+" : commentCount}
            </span>
          )}
        </span>
      </PillButton>
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
      <Popover>
        <PopoverTrigger
          render={
            <button
              aria-label="Paper settings"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-accent data-popup-open:bg-accent"
              title="Paper settings"
              type="button"
            />
          }
        >
          <Icon className="size-4.5" icon="mdi:file-cog-outline" />
          <span className="max-sm:hidden">{paperLabel(paper)}</span>
        </PopoverTrigger>
        <PopoverPopup align="end" className="w-80 max-w-[calc(100vw-1rem)]" side="top">
          <PaperSettings paper={paper} readOnly={readOnly} setPaper={setPaper} />
        </PopoverPopup>
      </Popover>
    </div>
  );
}

function PaperSettings({ paper, setPaper, readOnly }) {
  return (
    <fieldset className="flex flex-col gap-4 p-1" disabled={readOnly}>
      <PopoverTitle className="text-sm font-semibold">Paper</PopoverTitle>

      <Row label="Size">
        <Select onValueChange={(size) => setPaper({ size })} value={paper.size}>
          <SelectTrigger className="w-40" size="sm">
            <SelectValue>{(value) => PAPER_SIZES[value]?.label}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            {Object.entries(PAPER_SIZES).map(([value, size]) => (
              <SelectItem key={value} value={value}>
                {size.label}
                {size.width && (
                  <span className="ms-auto ps-3 text-xs text-muted-foreground">
                    {Math.round(size.width)}×{Math.round(size.height)}
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </Row>

      {paper.size === "custom" && (
        <Row label="Custom (mm)">
          <div className="flex w-40 items-center gap-1.5">
            <MmInput label="Width" onCommit={(customWidth) => setPaper({ customWidth })} value={paper.customWidth} />
            <span className="text-muted-foreground">×</span>
            <MmInput label="Height" onCommit={(customHeight) => setPaper({ customHeight })} value={paper.customHeight} />
          </div>
        </Row>
      )}

      <Row label="Orientation">
        <Choice
          onChange={(orientation) => setPaper({ orientation })}
          options={[
            { value: "portrait", label: "Portrait", icon: "mdi:crop-portrait" },
            { value: "landscape", label: "Landscape", icon: "mdi:crop-landscape" },
          ]}
          value={paper.orientation}
        />
      </Row>

      <Row label="Layout">
        <Choice
          onChange={(layout) => setPaper({ layout })}
          options={[
            { value: "paged", label: "Pages", icon: "mdi:file-document-multiple-outline" },
            { value: "continuous", label: "Endless", icon: "mdi:script-text-outline" },
          ]}
          value={paper.layout}
        />
      </Row>

      <Row label="Background">
        <Choice iconsOnly onChange={(pattern) => setPaper({ pattern })} options={PATTERNS} value={paper.pattern} />
      </Row>

      <SliderSetting
        {...MARGIN_RANGE}
        format={(value) => `${Number.isInteger(value) ? value : value.toFixed(1)} mm`}
        label="Margins"
        onCommit={(margin) => setPaper({ margin })}
        value={paper.margin}
      />

      <SliderSetting
        {...LINE_HEIGHT_RANGE}
        format={(value) => `${value.toFixed(2)}×`}
        label="Line spacing"
        onCommit={(lineHeight) => setPaper({ lineHeight })}
        value={paper.lineHeight}
      />

      <div className="flex flex-col gap-2 border-t pt-3">
        <TextSetting label="Header" onCommit={(header) => setPaper({ header })} value={paper.header} />
        <TextSetting label="Footer" onCommit={(footer) => setPaper({ footer })} value={paper.footer} />
        <label className="flex items-center justify-between gap-3 text-sm">
          Page numbers
          <Switch checked={paper.pageNumbers} onCheckedChange={(pageNumbers) => setPaper({ pageNumbers })} />
        </label>
      </div>
    </fieldset>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/*
 * Label, live value and a full-width slider. The paper only re-flows on
 * release, so dragging stays smooth on long documents.
 */
function SliderSetting({ label, value, min, max, step, format, onCommit }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? value;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-xs tabular-nums">{format(shown)}</span>
      </div>
      <Slider
        className="[&_[data-slot=slider-control]]:min-w-0"
        getAriaLabel={() => label}
        max={max}
        min={min}
        onValueChange={(next) => setDraft(next)}
        onValueCommitted={(next) => {
          setDraft(null);
          if (next !== value) onCommit(next);
        }}
        step={step}
        value={shown}
      />
    </div>
  );
}

function Choice({ options, value, onChange, iconsOnly }) {
  return (
    <SegmentedControl size="sm">
      {options.map((option) => (
        <SegmentedControlItem
          aria-label={option.label}
          aria-pressed={value === option.value}
          data-pressed={value === option.value ? "" : undefined}
          key={option.value}
          onClick={() => onChange(option.value)}
          title={option.label}
        >
          {option.icon && <Icon icon={option.icon} />}
          {!iconsOnly && <span className={cn(option.icon && "max-sm:sr-only")}>{option.label}</span>}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}

// Commits on blur / Enter so a half-typed number never re-flows the page.
function MmInput({ label, value, onCommit }) {
  return (
    <Input
      aria-label={label}
      defaultValue={Math.round(value)}
      inputMode="decimal"
      key={value}
      onBlur={(event) => {
        const number = Number(event.target.value);
        if (Number.isFinite(number) && number >= 50 && number <= 1000) onCommit(number);
        else event.target.value = Math.round(value);
      }}
      onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
      size="sm"
      type="number"
    />
  );
}

function TextSetting({ label, value, onCommit }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      <Input
        className="w-48"
        defaultValue={value}
        key={value}
        maxLength={120}
        onBlur={(event) => event.target.value !== value && onCommit(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        placeholder={`${label} text`}
        size="sm"
      />
    </label>
  );
}

function PillButton({ label, onClick, disabled, active, children }) {
  return (
    <button
      aria-label={label}
      aria-pressed={active === undefined ? undefined : Boolean(active)}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md hover:bg-accent disabled:opacity-40 [&_svg]:size-4.5",
        active && "bg-accent text-accent-foreground",
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
