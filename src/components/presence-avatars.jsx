"use client";

import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { usePresence } from "@/hooks/use-presence";
import { PersonAvatar } from "./person-avatar";

const MAX_SHOWN = 3;

/*
 * Who else has this note open right now: up to three avatars, then "+N".
 * Clicking opens the full list. Renders nothing when you are alone.
 */
export function PresenceAvatars({ awareness }) {
  const people = usePresence(awareness);
  if (!people.length) return null;
  const shown = people.slice(0, MAX_SHOWN);
  const extra = people.length - shown.length;
  const label = people.length === 1 ? `${people[0].name} is here` : `${people.length} others are here`;

  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className="flex shrink-0 items-center rounded-full p-0.5 hover:bg-accent"
        title={label}
      >
        {shown.map((person, index) => (
          <PersonAvatar className={index ? "-ms-2" : undefined} color={person.color} key={person.id} name={person.name} />
        ))}
        {extra > 0 && (
          <span className="-ms-2 inline-flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium ring-2 ring-background">
            +{extra}
          </span>
        )}
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-64">
        <PopoverTitle className="mb-2 text-sm">Here now</PopoverTitle>
        <ul className="flex flex-col gap-2">
          {people.map((person) => (
            <li className="flex items-center gap-2" key={person.id}>
              <PersonAvatar color={person.color} name={person.name} online />
              <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
            </li>
          ))}
        </ul>
      </PopoverPopup>
    </Popover>
  );
}
