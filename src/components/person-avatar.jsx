import { cn } from "@/lib/utils";

// Example: "John Doe" -> "JD", "john@example.com" -> "J"
export function initials(name = "") {
  const words = name.includes("@") ? [name] : name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words.at(-1)[0] : (words[0]?.[0] ?? "?")).toUpperCase();
}

/*
 * Round initials badge in the person's cursor color. `online` adds a
 * small green dot in the corner.
 */
export function PersonAvatar({ name, color, online, className }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold text-white ring-2 ring-background",
        className,
      )}
      style={{ background: color ?? "var(--color-stone-400)" }}
    >
      {initials(name)}
      {online && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-success ring-2 ring-background" />}
    </span>
  );
}
