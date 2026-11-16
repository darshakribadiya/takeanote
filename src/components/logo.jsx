import { APP_NAME } from "@/constants";
import { cn } from "@/lib/utils";

/*
 * Take a Note logo: a note card with a folded corner, a quick pen tick and
 * two lines of writing. Drawn on a 24-unit grid with round 2-unit strokes
 * so it stays crisp from a 16px favicon up to the Open Graph image.
 * The same paths live in app/icon.svg and public/logo.svg.
 */
export const LOGO_PATHS = [
  // Card with the top-right corner folded.
  "M6.5 3.5h8.25L19.5 8.25V18.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z",
  // The fold.
  "M14.5 3.5v3.75a1 1 0 0 0 1 1h4",
  // Pen tick.
  "m8 11.25 1.75 1.75 3.5-3.75",
  // Lines of writing.
  "M8 16.5h8",
];

export const BRAND_COLOR = "#4f46e5";

// The mark alone: white strokes on an indigo tile. `size` in px.
export function LogoMark({ className, size = 28 }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0", className)}
      height={size}
      viewBox="0 0 32 32"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill={BRAND_COLOR} height="32" rx="8" width="32" />
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" transform="translate(4 4)">
        {LOGO_PATHS.map((d) => (
          <path d={d} key={d} />
        ))}
      </g>
    </svg>
  );
}

// Mark plus the product name, for headers.
export function Logo({ className, size = 28 }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-heading font-semibold", className)}>
      <LogoMark size={size} />
      <span>{APP_NAME}</span>
    </span>
  );
}
