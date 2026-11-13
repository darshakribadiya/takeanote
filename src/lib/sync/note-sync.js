import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness";
import { createClient } from "@/lib/supabase/client";
import { fromBase64, toBase64 } from "@/lib/sync/base64";
import { PAPER_SIZES, readPaper } from "@/lib/editor/paper";
import { AUTOSAVE, BODY, EDGES, isEmptyDoc, NODES, plainText, SETTINGS, TITLE } from "@/lib/sync/doc-model";

/*
 * Keeps one note's Yjs document in sync across this device, the server
 * and every open tab or collaborator.
 *
 *   1. IndexedDB copy loads first: the note opens instantly, even offline.
 *   2. Server state (snapshot + update log) is merged in.
 *   3. Anything only this device has is pushed (offline edits survive).
 *   4. Live: each local change is broadcast at once over a private
 *      Realtime channel and appended to the log in small batches.
 *
 * Autosave is a per-note setting (Yjs settings.autosave, default on).
 * When it is off, local edits wait in `unsaved` (and IndexedDB) and
 * nobody else sees them until save() (Ctrl+S / Save button) sends them
 * as one update. Turning the setting back on saves anything waiting.
 *
 * Yjs merges are commutative and idempotent, so replaying an update twice
 * or out of order is harmless; that is what makes retries simple.
 *
 * status: loading | saved | saving | unsaved | offline | error
 */

const REMOTE = Symbol("remote");
// Local changes that go out even with autosave off (the toggle itself).
export const COMMIT = Symbol("commit");
// Larger changes are announced instead of broadcast; peers read them from the log.
const MAX_BROADCAST_CHARS = 200_000;
const PERSIST_DELAY_MS = 400;
const PROJECT_DELAY_MS = 1200;
const RETRY_DELAYS_MS = [1000, 3000, 8000, 20000];
const PAGE_SIZE = 1000;
// Fold the log into the snapshot once it grows past this many rows.
const COMPACT_THRESHOLD = 200;

export class NoteSync {
  constructor({ noteId, kind, doc, awareness, canEdit, isOwner, ensurePersisted, shouldPersist, onLocalText }) {
    this.noteId = noteId;
    this.kind = kind;
    this.doc = doc;
    this.awareness = awareness;
    this.canEdit = canEdit;
    this.isOwner = isOwner;
    this.ensurePersisted = ensurePersisted ?? (async () => {});
    // A brand-new note stays local (no row, no log) until it has content.
    this.shouldPersist = shouldPersist ?? (() => true);
    this.onLocalText = onLocalText;
    this.listeners = new Set();
    this.state = { status: "loading", localReady: false, error: null, peers: 0 };
    this.pending = [];
    this.unsaved = [];
    this.lastSeq = 0;
    this.logSize = 0;
    this.generation = 0;
  }

  // ---- subscription for React -------------------------------------------

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  get autosave() {
    return this.doc.getMap(SETTINGS).get(AUTOSAVE) !== false;
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  // ---- lifecycle ----------------------------------------------------------

  async start() {
    const generation = ++this.generation;
    const alive = () => generation === this.generation;

    this.idb = new IndexeddbPersistence(localDocName(this.noteId), this.doc);
    await this.idb.whenSynced;
    if (!alive()) return;
    this.set({ localReady: true });

    this.doc.on("update", this.handleDocUpdate);
    this.doc.getMap(SETTINGS).observe(this.handleSettings);
    this.awareness.on("update", this.handleAwarenessUpdate);
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("beforeunload", this.handleBeforeUnload);
    document.addEventListener("visibilitychange", this.handleVisibility);

    try {
      await this.pull({ initial: true });
      if (!alive()) return;
      this.set({ status: this.idleStatus(), error: null });
    } catch (error) {
      if (!alive()) return;
      this.set({ status: navigator.onLine ? "error" : "offline", error: error.message });
    }
    if (alive()) this.connect();
  }

  stop() {
    this.generation += 1;
    clearTimeout(this.persistTimer);
    clearTimeout(this.projectTimer);
    clearTimeout(this.retryTimer);
    this.doc.off("update", this.handleDocUpdate);
    this.doc.getMap(SETTINGS).unobserve(this.handleSettings);
    this.awareness.off("update", this.handleAwarenessUpdate);
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("beforeunload", this.handleBeforeUnload);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    // Best effort; anything unsent is still in IndexedDB and is re-diffed next open.
    // Unsaved (manual-save) edits stay unsaved and come back as such next time.
    if (this.pending.length) this.persist();
    if (this.projectDirty) this.project();
    removeAwarenessStates(this.awareness, [this.doc.clientID], "local");
    if (this.channel) createClient().removeChannel(this.channel);
    this.channel = null;
    this.idb?.destroy();
    this.idb = null;
  }

  // ---- server pull --------------------------------------------------------

  async pull({ initial = false } = {}) {
    const client = createClient();
    let serverDoc = null;

    if (initial) {
      serverDoc = new Y.Doc();
      // Shared fields (legacy plain text) on notes; the snapshot on the kind's content table.
      const [noteResult, contentResult] = await Promise.all([
        client.from("notes").select("title, content").eq("id", this.noteId).maybeSingle(),
        client.from(contentTable(this.kind)).select("ydoc, ydoc_seq").eq("note_id", this.noteId).maybeSingle(),
      ]);
      if (noteResult.error) throw noteResult.error;
      if (contentResult.error) throw contentResult.error;
      const row = noteResult.data ? { ...noteResult.data, ...contentResult.data } : null;
      if (row?.ydoc) {
        const snapshot = fromBase64(row.ydoc);
        Y.applyUpdate(serverDoc, snapshot);
        Y.applyUpdate(this.doc, snapshot, REMOTE);
      }
      this.lastSeq = row?.ydoc_seq ?? 0;
      this.logSize = 0;
      this.legacy = row && !row.ydoc && (row.title || row.content) ? row : null;
    }

    for (;;) {
      const { data: rows, error } = await client
        .from("note_updates")
        .select("id, update")
        .eq("note_id", this.noteId)
        .gt("id", this.lastSeq)
        .order("id")
        .limit(PAGE_SIZE);
      if (error) throw error;
      if (!rows.length) break;
      for (const row of rows) {
        const update = fromBase64(row.update);
        if (serverDoc) Y.applyUpdate(serverDoc, update);
        Y.applyUpdate(this.doc, update, REMOTE);
        this.lastSeq = row.id;
        this.logSize += 1;
      }
      if (rows.length < PAGE_SIZE) break;
    }

    if (initial && this.legacy && this.isOwner && this.canEdit && this.logSize === 0 && isEmptyDoc(this.doc)) {
      seedFromPlainText(this.doc, this.legacy);
    }
    this.legacy = null;

    if (serverDoc && this.canEdit) {
      // Whatever this device has that the server lacks (offline edits).
      const missing = Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(serverDoc));
      if (hasChanges(missing, serverDoc)) {
        if (this.autosave) {
          this.pending.push(missing);
          this.schedulePersist(0);
          this.scheduleProject();
        } else {
          // Edits from an earlier visit that were never saved.
          this.unsaved = [missing];
        }
      }
      serverDoc.destroy();
    }

    if (initial && this.isOwner && this.logSize >= COMPACT_THRESHOLD) this.compact();
  }

  async compact() {
    try {
      const snapshot = toBase64(Y.encodeStateAsUpdate(this.doc));
      const { data } = await createClient().rpc("compact_note", {
        p_note: this.noteId,
        p_snapshot: snapshot,
        p_upto: this.lastSeq,
      });
      if (data) this.logSize = 0;
    } catch {
      // Compaction is an optimisation; the log stays valid without it.
    }
  }

  // ---- realtime -----------------------------------------------------------

  async connect() {
    const client = createClient();
    await client.realtime.setAuth();
    const generation = this.generation;
    let subscribedBefore = false;

    const channel = client
      .channel(`note:${this.noteId}`, { config: { private: true, broadcast: { self: false } } })
      .on("broadcast", { event: "y" }, ({ payload }) => Y.applyUpdate(this.doc, fromBase64(payload.u), REMOTE))
      // A change too large to broadcast: read it from the log.
      .on("broadcast", { event: "pull" }, () => this.pull().catch(() => {}))
      .on("broadcast", { event: "aw" }, ({ payload }) => {
        applyAwarenessUpdate(this.awareness, fromBase64(payload.u), REMOTE);
        this.set({ peers: Math.max(0, this.awareness.getStates().size - 1) });
      })
      .on("broadcast", { event: "aw-q" }, () => this.sendAwareness())
      .subscribe((status) => {
        if (generation !== this.generation) return;
        if (status === "SUBSCRIBED") {
          this.sendAwareness();
          if (this.canEdit) channel.send({ type: "broadcast", event: "aw-q", payload: {} });
          // Broadcasts sent while we were away are only in the log.
          if (subscribedBefore) this.pull().catch(() => {});
          subscribedBefore = true;
        }
      });

    this.channel = channel;
  }

  sendAwareness() {
    if (!this.channel || !this.canEdit) return;
    const update = encodeAwarenessUpdate(this.awareness, [this.doc.clientID]);
    this.channel.send({ type: "broadcast", event: "aw", payload: { u: toBase64(update) } });
  }

  handleAwarenessUpdate = ({ added, updated, removed }, origin) => {
    this.set({ peers: Math.max(0, this.awareness.getStates().size - 1) });
    if (origin === REMOTE) return;
    const changed = [...added, ...updated, ...removed];
    if (!changed.includes(this.doc.clientID) || !this.channel || !this.canEdit) return;
    const update = encodeAwarenessUpdate(this.awareness, changed);
    this.channel.send({ type: "broadcast", event: "aw", payload: { u: toBase64(update) } });
  };

  // ---- local changes ------------------------------------------------------

  handleDocUpdate = (update, origin) => {
    if (origin === REMOTE || origin === this.idb) {
      this.scheduleProject({ remote: true });
      return;
    }
    if (!this.canEdit) return;
    if (!this.autosave && origin !== COMMIT) {
      this.unsaved.push(update);
      this.set({ status: "unsaved" });
      // The list preview on this device stays live; nothing leaves it.
      this.scheduleProject({ remote: true });
      return;
    }
    this.send(update);
  };

  // Broadcasts to everyone on the note now and queues it for the server log.
  send(update) {
    const encoded = toBase64(update);
    if (encoded.length <= MAX_BROADCAST_CHARS) {
      this.channel?.send({ type: "broadcast", event: "y", payload: { u: encoded } });
    } else {
      this.announceAfterPersist = true;
    }
    this.pending.push(update);
    if (this.state.status !== "offline") this.set({ status: "saving" });
    this.schedulePersist();
    this.scheduleProject();
  }

  /*
   * Manual save (Ctrl+S / Save button): sends every unsaved edit as one
   * update, then writes it to the server right away.
   */
  async save() {
    if (this.unsaved.length && this.canEdit) {
      const merged = Y.mergeUpdates(this.unsaved);
      this.unsaved = [];
      this.send(merged);
    }
    await this.flush();
    if (this.projectDirty) {
      clearTimeout(this.projectTimer);
      await this.project();
    }
  }

  // Turning autosave on saves what was waiting; turning it off applies for everyone at once.
  async setAutosave(enabled) {
    if (!this.canEdit) return;
    if (enabled) await this.save();
    this.doc.transact(() => this.doc.getMap(SETTINGS).set(AUTOSAVE, enabled), COMMIT);
    await this.flush();
  }

  // A collaborator turned autosave back on: edits waiting here go out too.
  handleSettings = (event) => {
    if (event.keysChanged.has(AUTOSAVE) && this.autosave && this.unsaved.length) this.save();
  };

  handleBeforeUnload = (event) => {
    if (!this.unsaved.length && !this.pending.length) return;
    event.preventDefault();
    // Queued autosave edits: one last attempt while the page closes.
    if (this.pending.length) this.flush();
  };

  idleStatus() {
    if (this.pending.length) return "saving";
    return this.unsaved.length ? "unsaved" : "saved";
  }

  schedulePersist(delay = PERSIST_DELAY_MS) {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persist(), delay);
  }

  async persist() {
    if (this.inFlight || !this.pending.length) return;
    if (!this.shouldPersist(this.doc)) {
      // Kept in `pending` (and IndexedDB); sent with the first real edit.
      this.set({ status: this.unsaved.length ? "unsaved" : "saved", error: null });
      return;
    }
    this.inFlight = true;
    const batch = Y.mergeUpdates(this.pending);
    this.pending = [];
    try {
      await this.ensurePersisted();
      const { error } = await createClient()
        .from("note_updates")
        .insert({ note_id: this.noteId, update: toBase64(batch) });
      if (error) throw error;
      this.retryCount = 0;
      this.logSize += 1;
      if (this.announceAfterPersist) {
        this.announceAfterPersist = false;
        this.channel?.send({ type: "broadcast", event: "pull", payload: {} });
      }
      if (!this.pending.length) this.set({ status: this.idleStatus(), error: null, savedAt: Date.now() });
    } catch (error) {
      this.pending.unshift(batch);
      const offline = !navigator.onLine || /fetch|network/i.test(error?.message ?? "");
      this.set({ status: offline ? "offline" : "error", error: error?.message ?? "Couldn't save" });
      const delay = RETRY_DELAYS_MS[Math.min(this.retryCount ?? 0, RETRY_DELAYS_MS.length - 1)];
      this.retryCount = (this.retryCount ?? 0) + 1;
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this.persist(), delay);
    } finally {
      this.inFlight = false;
    }
    if (this.pending.length && this.state.status === "saving") this.schedulePersist(0);
  }

  // Writes queued (already shared) edits now. Unsaved edits are left alone.
  flush() {
    clearTimeout(this.persistTimer);
    return this.persist();
  }

  // ---- plain-text projection ---------------------------------------------

  scheduleProject({ remote = false } = {}) {
    const title = this.doc.getText(TITLE).toString();
    const text = plainText(this.doc, this.kind);
    this.onLocalText?.({ title, text });
    if (remote || !this.canEdit) return;
    this.projectDirty = true;
    clearTimeout(this.projectTimer);
    this.projectTimer = setTimeout(() => this.project(), PROJECT_DELAY_MS);
  }

  async project() {
    if (!this.shouldPersist(this.doc)) return;
    this.projectDirty = false;
    try {
      await this.ensurePersisted();
      await createClient().rpc("update_note_text", {
        p_note: this.noteId,
        p_title: this.doc.getText(TITLE).toString(),
        p_content: plainText(this.doc, this.kind),
        p_meta: contentMeta(this.doc, this.kind),
      });
    } catch {
      this.projectDirty = true;
    }
  }

  handleOnline = () => {
    if (this.state.status === "offline") this.set({ status: this.idleStatus() });
    this.flush();
    if (this.projectDirty) this.project();
    this.pull().catch(() => {});
  };

  handleVisibility = () => {
    if (document.visibilityState === "visible") this.pull().catch(() => {});
    else this.flush();
  };
}

/*
 * Notes written before documents were collaborative only have plain
 * text. The first time the owner opens one, its title and lines become
 * the Yjs document (one paragraph per line); this is a normal local edit,
 * so it syncs like any other.
 */
function seedFromPlainText(doc, { title, content }) {
  doc.transact(() => {
    if (title) doc.getText(TITLE).insert(0, title);
    const lines = (content ?? "").split(/\r?\n/);
    const paragraphs = lines.map((line) => {
      const paragraph = new Y.XmlElement("paragraph");
      if (line) paragraph.insert(0, [new Y.XmlText(line)]);
      return paragraph;
    });
    if (content) doc.getXmlFragment(BODY).insert(0, paragraphs);
  });
}

// Each kind keeps its snapshot in its own table (see the note_content_tables migration).
export function contentTable(kind) {
  return kind === "canvas" ? "note_canvases" : "note_documents";
}

/*
 * Kind-specific summary columns mirrored from the Yjs document, clamped
 * to the database checks.
 * Example (document): { paper_size: "a4", orientation: "portrait", margin_mm: 25.4, … }
 * Example (canvas):   { node_count: 12, edge_count: 4 }
 */
export function contentMeta(doc, kind) {
  if (kind === "canvas") {
    return { node_count: doc.getMap(NODES).size, edge_count: doc.getMap(EDGES).size };
  }
  const paper = readPaper(doc.getMap(SETTINGS));
  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback;
  };
  return {
    paper_size: PAPER_SIZES[paper.size] ? paper.size : "a4",
    paper_width_mm: clamp(paper.customWidth, 50, 1000, 210),
    paper_height_mm: clamp(paper.customHeight, 50, 1000, 297),
    orientation: paper.orientation === "landscape" ? "landscape" : "portrait",
    layout: paper.layout === "continuous" ? "continuous" : "paged",
    pattern: ["plain", "ruled", "grid", "dotted"].includes(paper.pattern) ? paper.pattern : "plain",
    margin_mm: clamp(paper.margin, 0, 100, 25.4),
    line_height: clamp(paper.lineHeight, 1, 3, 1.6),
    header: String(paper.header ?? "").slice(0, 120),
    footer: String(paper.footer ?? "").slice(0, 120),
    page_numbers: paper.pageNumbers !== false,
  };
}

export function localDocName(noteId) {
  return `qn:note:${noteId}`;
}

/*
 * Full server state of a note (snapshot + every logged update) as one
 * Yjs update, for duplicating a note without opening it.
 */
export async function loadServerState(noteId, kind = "document") {
  const client = createClient();
  const doc = new Y.Doc();
  const { data: row, error } = await client
    .from(contentTable(kind))
    .select("ydoc, ydoc_seq")
    .eq("note_id", noteId)
    .maybeSingle();
  if (error) throw error;
  if (row?.ydoc) Y.applyUpdate(doc, fromBase64(row.ydoc));
  let lastSeq = row?.ydoc_seq ?? 0;
  for (;;) {
    const { data: rows, error: logError } = await client
      .from("note_updates")
      .select("id, update")
      .eq("note_id", noteId)
      .gt("id", lastSeq)
      .order("id")
      .limit(PAGE_SIZE);
    if (logError) throw logError;
    for (const update of rows) {
      Y.applyUpdate(doc, fromBase64(update.update));
      lastSeq = update.id;
    }
    if (rows.length < PAGE_SIZE) break;
  }
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return state;
}

/*
 * Reads a note that only exists in this browser's IndexedDB (created
 * offline). Returns null when nothing was stored.
 */
export async function loadLocalState(noteId) {
  const doc = new Y.Doc();
  const idb = new IndexeddbPersistence(localDocName(noteId), doc);
  await idb.whenSynced;
  const state = doc.store.clients.size ? Y.encodeStateAsUpdate(doc) : null;
  await idb.destroy();
  doc.destroy();
  return state;
}

export function deleteLocalDoc(noteId) {
  try {
    indexedDB.deleteDatabase(localDocName(noteId));
  } catch {
    // Private mode or blocked storage: nothing was stored anyway.
  }
}

/*
 * Does `update` add anything the server lacks? Compares snapshots (state
 * vector + delete set), so offline deletions count, not only insertions.
 */
function hasChanges(update, serverDoc) {
  if (update.length <= 2) return false;
  const before = Y.snapshot(serverDoc);
  const probe = new Y.Doc({ gc: false });
  Y.applyUpdate(probe, Y.encodeStateAsUpdate(serverDoc));
  Y.applyUpdate(probe, update);
  const changed = !Y.equalSnapshots(before, Y.snapshot(probe));
  probe.destroy();
  return changed;
}
