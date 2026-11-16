import { useEffect, useState } from "react";

/*
 * Other people in the note right now, from the Yjs awareness channel.
 * One entry per person even when they have it open in several tabs.
 * Example: [{ id: "uuid", name: "Ada Lovelace", color: "#6366f1" }]
 */
export function usePresence(awareness) {
  const [people, setPeople] = useState(() => readPeople(awareness));

  useEffect(() => {
    if (!awareness) return;
    const update = () => setPeople(readPeople(awareness));
    awareness.on("change", update);
    update();
    return () => awareness.off("change", update);
  }, [awareness]);

  return people;
}

function readPeople(awareness) {
  if (!awareness) return [];
  const self = awareness.getLocalState()?.user;
  const byId = new Map();
  awareness.getStates().forEach((state, clientId) => {
    const user = state?.user;
    if (!user || clientId === awareness.clientID) return;
    const key = user.id ?? `client:${clientId}`;
    // The same account in another tab isn't "someone else".
    if (self?.id && key === self.id) return;
    if (!byId.has(key)) byId.set(key, { id: key, name: user.name ?? "Guest", color: user.color });
  });
  return [...byId.values()];
}
