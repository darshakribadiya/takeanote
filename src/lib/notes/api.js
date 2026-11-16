import * as Y from "yjs";
import { createClient } from "@/lib/supabase/client";
import { forgetPending, listPending, rememberPending } from "@/lib/notes/pending";
import { toBase64 } from "@/lib/sync/base64";
import { plainText, setTextMinimal, TITLE } from "@/lib/sync/doc-model";
import { deleteLocalDoc, loadLocalState, loadServerState } from "@/lib/sync/note-sync";
import { getOpenDoc } from "@/lib/sync/open-docs";
import {
  addNoteTag,
  getState,
  groupNoteTags,
  indexById,
  removeFolder,
  removeNote,
  removeNoteTag,
  removeTag,
  setState,
  upsertFolder,
  upsertNote,
  upsertTag,
} from "@/lib/notes/store";

/*
 * Everything the list needs. The note body is a Yjs document that the
 * editor syncs on its own (lib/sync/note-sync.js); `title` and `excerpt`
 * are plain-text projections of it.
 */
const NOTE_LIST_COLUMNS =
  "id,kind,title,excerpt,folder_id,is_favorite,is_pinned,content_updated_at,last_accessed_at,archived_at,deleted_at,created_at";

const supabase = () => createClient();

// Server row is now the truth: drop the not-yet-inserted flag and live typing overlay.
const SETTLED = { _local: false, _liveTitle: undefined, _liveExcerpt: undefined };

export function isNetworkError(error) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return /fetch|network|timeout/i.test(error?.message ?? "");
}

function check({ data, error }) {
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

// The signed-in user, or null. Guest (anonymous) sign-ins are turned off.
export async function ensureSession() {
  const { data } = await supabase().auth.getSession();
  return data.session?.user ?? null;
}

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

// Supabase's raw messages are terse; turn the common ones into plain advice.
function authError(error) {
  const message = error?.message ?? "";
  if (/invalid login credentials/i.test(message)) return new Error("Wrong email or password.");
  if (/already registered|already exists/i.test(message)) {
    return new Error("An account with this email already exists. Sign in instead.");
  }
  if (/rate limit|too many/i.test(message)) return new Error("Too many attempts. Wait a minute and try again.");
  return error;
}

export async function signInWithPassword(rawEmail, password) {
  const { data, error } = await supabase().auth.signInWithPassword({ email: normalizeEmail(rawEmail), password });
  if (error) throw authError(error);
  return data.user;
}

// Returns the new user, or null when Supabase still requires the email to be confirmed.
export async function signUpWithPassword(rawEmail, password) {
  const { data, error } = await supabase().auth.signUp({
    email: normalizeEmail(rawEmail),
    password,
    options: { emailRedirectTo: `${location.origin}/auth/callback` },
  });
  if (error) throw authError(error);
  // With email enumeration protection on, an existing email comes back as a user with no identities.
  if (data.user && !data.user.identities?.length) throw authError({ message: "already registered" });
  return data.session ? data.user : null;
}

/*
 * Emails a one-time link that signs the user in on /reset-password. The
 * reply is the same whether or not the email has an account, so the form
 * never reveals which addresses are registered.
 */
export async function sendPasswordReset(rawEmail) {
  const { error } = await supabase().auth.resetPasswordForEmail(normalizeEmail(rawEmail), {
    redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
  });
  if (error) throw authError(error);
}

export async function updatePassword(password) {
  const { error } = await supabase().auth.updateUser({ password });
  if (error) throw authError(error);
}

// A guest from before guest mode was removed keeps their notes by adding an email and password.
export async function addEmailToGuest(rawEmail, password) {
  const { data, error } = await supabase().auth.updateUser({ email: normalizeEmail(rawEmail), password });
  if (error) throw authError(error);
  return data.user;
}

/*
 * Only the user's own notes. Notes joined through a share link are
 * readable as well (RLS) but belong on the share page, not in this list.
 */
export async function loadWorkspace() {
  const client = supabase();
  const userId = getState().user?.id;
  const [notes, folders, tags, noteTags] = await Promise.all([
    client
      .from("notes")
      .select(NOTE_LIST_COLUMNS)
      .eq("user_id", userId)
      .order("content_updated_at", { ascending: false }),
    client.from("folders").select("*").order("position").order("name"),
    client.from("tags").select("*").order("name"),
    client.from("note_tags").select("note_id,tag_id"),
  ]);
  setState({
    notes: mergeNotes(getState().notes, check(notes)),
    folders: indexById(check(folders)),
    tags: indexById(check(tags)),
    noteTags: groupNoteTags(check(noteTags)),
  });
}

// Reloads keep the live typing overlay and notes that exist only on this device.
function mergeNotes(previous, rows) {
  const next = {};
  for (const row of rows) {
    const old = previous[row.id];
    next[row.id] = { ...row, _liveTitle: old?._liveTitle, _liveExcerpt: old?._liveExcerpt };
  }
  for (const note of Object.values(previous)) {
    if (note._local && !next[note.id]) next[note.id] = note;
  }
  return next;
}

// ---------------------------------------------------------------------------
// Notes: lifecycle
// ---------------------------------------------------------------------------

/*
 * A new note lives only in memory and IndexedDB until it has content;
 * `ensurePersisted` inserts its row right before the first save.
 */
export function createLocalNote({ kind = "document", folderId = null, isFavorite = false } = {}) {
  const now = new Date().toISOString();
  const note = {
    id: crypto.randomUUID(),
    kind,
    title: "",
    excerpt: "",
    folder_id: folderId,
    is_favorite: isFavorite,
    is_pinned: false,
    content_updated_at: now,
    last_accessed_at: now,
    created_at: now,
    archived_at: null,
    deleted_at: null,
    _local: true,
  };
  upsertNote(note);
  rememberPending(note);
  return note;
}

export async function fetchNote(id) {
  const row = check(await supabase().from("notes").select(NOTE_LIST_COLUMNS).eq("id", id).maybeSingle());
  if (row) upsertNote({ ...row, ...SETTLED });
  return row;
}

function rowFields(note) {
  return {
    id: note.id,
    kind: note.kind ?? "document",
    folder_id: note.folder_id ?? null,
    is_favorite: note.is_favorite ?? false,
    is_pinned: note.is_pinned ?? false,
  };
}

/*
 * Inserts the row of a still-local note. Safe to call repeatedly and
 * concurrently; a retried insert whose first reply was lost is a no-op.
 */
const inserting = new Map();

export function ensurePersisted(noteId) {
  const note = getState().notes[noteId];
  if (!note?._local) return Promise.resolve();
  if (!inserting.has(noteId)) {
    const task = (async () => {
      const { error } = await supabase()
        .from("notes")
        .upsert(rowFields(note), { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
      upsertNote({ id: noteId, _local: false });
      forgetPending(noteId);
    })().finally(() => inserting.delete(noteId));
    inserting.set(noteId, task);
  }
  return inserting.get(noteId);
}

/*
 * Notes created on this device whose row never reached the server (the
 * tab closed while offline). Their Yjs state is still in IndexedDB.
 */
export async function recoverPendingNotes() {
  const client = supabase();
  for (const [id, fields] of Object.entries(listPending())) {
    const known = getState().notes[id];
    if (known && !known._local) {
      forgetPending(id);
      continue;
    }
    // Still open in this tab; its own editor inserts it.
    if (known?._local) continue;
    try {
      const state = await loadLocalState(id);
      const doc = new Y.Doc();
      if (state) Y.applyUpdate(doc, state);
      const kind = fields.kind ?? "document";
      const title = doc.getText(TITLE).toString();
      const content = plainText(doc, kind);
      doc.destroy();
      if (!state || (!title.trim() && !content.trim())) {
        forgetPending(id);
        deleteLocalDoc(id);
        continue;
      }
      const { data, error } = await client
        .from("notes")
        .upsert({ ...rowFields({ id, ...fields }), title, content }, { onConflict: "id", ignoreDuplicates: true })
        .select(NOTE_LIST_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      // Yjs merges are idempotent, so re-sending after a half-finished attempt is harmless.
      await appendState(id, state);
      if (data) upsertNote({ ...data, ...SETTLED });
      forgetPending(id);
    } catch (error) {
      if (isNetworkError(error)) return;
    }
  }
}

/*
 * Seeds a note's content with a full Yjs state through the update log
 * (clients never write the content tables directly; compaction folds it
 * into the snapshot later).
 */
async function appendState(noteId, state) {
  const { error } = await supabase().from("note_updates").insert({ note_id: noteId, update: toBase64(state) });
  if (error) throw error;
}

/*
 * A new note left without a single character is dropped instead of
 * being listed as "Untitled". Returns true when it was dropped.
 */
export function discardIfEmpty(noteId) {
  const note = getState().notes[noteId];
  if (!note?._local) return false;
  if ((note._liveTitle ?? "").trim() || (note._liveExcerpt ?? "").trim()) return false;
  removeNote(noteId);
  forgetPending(noteId);
  deleteLocalDoc(noteId);
  return true;
}

// ---------------------------------------------------------------------------
// Notes: metadata (optimistic, rolled back on failure)
// ---------------------------------------------------------------------------

async function optimisticNoteUpdate(id, patch) {
  const previous = getState().notes[id];
  if (!previous) return;
  upsertNote(patch);
  if (previous._local) {
    rememberPending({ ...previous, ...patch });
    return;
  }
  const { error } = await supabase().from("notes").update(patch).eq("id", id);
  if (error) {
    upsertNote(previous);
    throw error;
  }
}

export const toggleFavorite = (note) => optimisticNoteUpdate(note.id, { id: note.id, is_favorite: !note.is_favorite });
export const togglePinned = (note) => optimisticNoteUpdate(note.id, { id: note.id, is_pinned: !note.is_pinned });
export const moveToFolder = (note, folderId) => optimisticNoteUpdate(note.id, { id: note.id, folder_id: folderId });
export const archiveNote = (note) =>
  optimisticNoteUpdate(note.id, { id: note.id, archived_at: new Date().toISOString(), is_pinned: false });
export const unarchiveNote = (note) => optimisticNoteUpdate(note.id, { id: note.id, archived_at: null });
export const restoreNote = (note) =>
  optimisticNoteUpdate(note.id, { id: note.id, deleted_at: null, archived_at: null });

export async function trashNote(note) {
  // A never-saved note has nothing worth keeping in Trash.
  if (note._local) {
    removeNote(note.id);
    forgetPending(note.id);
    deleteLocalDoc(note.id);
    return;
  }
  await optimisticNoteUpdate(note.id, { id: note.id, deleted_at: new Date().toISOString(), is_pinned: false });
}

export async function purgeNote(note) {
  const previous = getState().notes[note.id];
  removeNote(note.id);
  deleteLocalDoc(note.id);
  if (note._local) {
    forgetPending(note.id);
    return;
  }
  const { error } = await supabase().from("notes").delete().eq("id", note.id);
  if (error) {
    upsertNote(previous);
    throw error;
  }
}

export async function emptyTrash() {
  const trashed = Object.values(getState().notes).filter((note) => note.deleted_at);
  trashed.forEach((note) => {
    removeNote(note.id);
    deleteLocalDoc(note.id);
  });
  const { error } = await supabase()
    .from("notes")
    .delete()
    .in(
      "id",
      trashed.map((note) => note.id),
    );
  if (error) {
    trashed.forEach(upsertNote);
    throw error;
  }
}

// Metadata only: the body is untouched, so `content_updated_at` stays put.
export async function touchNote(note) {
  if (note._local) return;
  const now = new Date().toISOString();
  upsertNote({ id: note.id, last_accessed_at: now });
  await supabase().from("notes").update({ last_accessed_at: now }).eq("id", note.id);
}

/*
 * Copies the whole Yjs document into a new note. An open editor passes
 * its in-memory `state` so keystrokes not yet saved are included.
 */
export async function duplicateNote(note, { state } = {}) {
  const source = state ?? (await noteState(note));
  const doc = new Y.Doc();
  Y.applyUpdate(doc, source);
  const title = doc.getText(TITLE);
  if (title.toString()) setTextMinimal(title, `${title.toString()} (copy)`);
  const kind = note.kind ?? "document";
  const payload = {
    ...rowFields({ ...note, id: crypto.randomUUID(), is_pinned: false }),
    title: title.toString(),
    content: plainText(doc, kind),
  };
  const copyState = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  // The insert trigger creates the copy's note_documents / note_canvases row.
  const row = check(await supabase().from("notes").insert(payload).select(NOTE_LIST_COLUMNS).single());
  await appendState(row.id, copyState);
  upsertNote({ ...row, ...SETTLED });
  const tagIds = getState().noteTags[note.id] ?? [];
  await Promise.all(tagIds.map((tagId) => setNoteTag(row.id, tagId, true)));
  return row.id;
}

/*
 * Current Yjs state of any note: the live document when it is open in
 * this tab (includes unsaved keystrokes), else the server copy.
 */
export async function noteState(note) {
  const open = getOpenDoc(note.id);
  return open ? Y.encodeStateAsUpdate(open) : loadServerState(note.id, note.kind);
}

/*
 * Renames a note from outside its editor (sidebar). The title lives in
 * the note's Yjs document, so the change is written as a Yjs update:
 * through the open editor's sync when the note is open, otherwise
 * appended to the update log with the list projection refreshed.
 */
export async function renameNote(note, rawTitle) {
  const title = rawTitle.replace(/\s+/g, " ").trim().slice(0, 500);
  const previous = getState().notes[note.id];
  upsertNote({ id: note.id, title, _liveTitle: undefined });

  const open = getOpenDoc(note.id);
  if (open) {
    setTextMinimal(open.getText(TITLE), title);
    return;
  }
  if (note._local) throw new Error("Open the note once before renaming it.");

  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, await loadServerState(note.id, note.kind));
    const updates = [];
    doc.on("update", (update) => updates.push(update));
    setTextMinimal(doc.getText(TITLE), title);
    if (updates.length) await appendState(note.id, Y.mergeUpdates(updates));
    const { error } = await supabase().rpc("update_note_text", {
      p_note: note.id,
      p_title: title,
      p_content: plainText(doc, note.kind ?? "document"),
    });
    doc.destroy();
    if (error) throw error;
  } catch (error) {
    if (previous) upsertNote(previous);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function createFolder(name) {
  const folders = Object.values(getState().folders);
  const folder = {
    id: crypto.randomUUID(),
    name: name.trim(),
    parent_id: null,
    position: folders.length ? Math.max(...folders.map((f) => f.position)) + 1 : 0,
  };
  upsertFolder(folder);
  const { error } = await supabase().from("folders").insert(folder);
  if (error) {
    removeFolder(folder.id);
    throw error;
  }
  return folder;
}

export async function renameFolder(folder, name) {
  upsertFolder({ id: folder.id, name: name.trim() });
  const { error } = await supabase().from("folders").update({ name: name.trim() }).eq("id", folder.id);
  if (error) {
    upsertFolder(folder);
    throw error;
  }
}

export async function deleteFolder(folder) {
  const snapshot = getState();
  removeFolder(folder.id);
  const { error } = await supabase().from("folders").delete().eq("id", folder.id);
  if (error) {
    setState({ folders: snapshot.folders, notes: snapshot.notes });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function createTag(name) {
  const tag = { id: crypto.randomUUID(), name: name.trim().replace(/^#/, ""), color: null };
  upsertTag(tag);
  const { error } = await supabase().from("tags").insert(tag);
  if (error) {
    removeTag(tag.id);
    throw error;
  }
  return tag;
}

export async function deleteTag(tag) {
  const snapshot = getState();
  removeTag(tag.id);
  const { error } = await supabase().from("tags").delete().eq("id", tag.id);
  if (error) {
    setState({ tags: snapshot.tags, noteTags: snapshot.noteTags });
    throw error;
  }
}

export async function setNoteTag(noteId, tagId, attached) {
  await ensurePersisted(noteId);
  if (attached) {
    addNoteTag(noteId, tagId);
    const { error } = await supabase().from("note_tags").upsert({ note_id: noteId, tag_id: tagId });
    if (error) {
      removeNoteTag(noteId, tagId);
      throw error;
    }
  } else {
    removeNoteTag(noteId, tagId);
    const { error } = await supabase().from("note_tags").delete().match({ note_id: noteId, tag_id: tagId });
    if (error) {
      addNoteTag(noteId, tagId);
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

export function shareUrl(token) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
  return `${origin}/s/${token}`;
}

export async function listShares(noteId) {
  if (getState().notes[noteId]?._local) return [];
  return check(
    await supabase()
      .from("note_shares")
      .select("*")
      .eq("note_id", noteId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  );
}

export async function createShare(noteId, { permission, expiresAt }) {
  await ensurePersisted(noteId);
  return check(
    await supabase()
      .from("note_shares")
      .insert({ note_id: noteId, permission, expires_at: expiresAt })
      .select("*")
      .single(),
  );
}

/*
 * Opens a share link: records this visitor as a member (so RLS, Realtime
 * and Storage let them in). Returns { note_id, kind, title, permission }
 * or null when the link is invalid, revoked or expired.
 */
export async function joinShare(token) {
  const { data, error } = await supabase().rpc("join_share", { p_token: token });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function revokeShare(shareId) {
  check(
    await supabase().from("note_shares").update({ revoked_at: new Date().toISOString() }).eq("id", shareId),
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

// Full-text match on note bodies; titles and excerpts are matched locally.
export async function searchNoteIds(query) {
  const { data, error } = await supabase()
    .from("notes")
    .select("id")
    .eq("user_id", getState().user?.id)
    .textSearch("search", query, { type: "websearch", config: "simple" })
    .is("deleted_at", null)
    .limit(50);
  if (error) return [];
  return data.map((row) => row.id);
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

// Mirrors list metadata changed on another device or tab into the store.
export function subscribeWorkspace(userId, { onStatus } = {}) {
  const client = supabase();
  const own = `user_id=eq.${userId}`;
  const channel = client
    .channel(`workspace:${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notes", filter: own }, ({ new: row }) =>
      upsertNote(listFields(row)),
    )
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notes", filter: own }, ({ new: row }) =>
      upsertNote(listFields(row)),
    )
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "notes" }, ({ old }) => removeNote(old.id))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "folders", filter: own }, ({ new: row }) =>
      upsertFolder(row),
    )
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "folders", filter: own }, ({ new: row }) =>
      upsertFolder(row),
    )
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "folders" }, ({ old }) =>
      removeFolder(old.id),
    )
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "tags", filter: own }, ({ new: row }) =>
      upsertTag(row),
    )
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tags", filter: own }, ({ new: row }) =>
      upsertTag(row),
    )
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "tags" }, ({ old }) => removeTag(old.id))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "note_tags", filter: own }, ({ new: row }) =>
      addNoteTag(row.note_id, row.tag_id),
    )
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "note_tags" }, ({ old }) =>
      removeNoteTag(old.note_id, old.tag_id),
    )
    .subscribe((status) => onStatus?.(status));

  return () => client.removeChannel(channel);
}

// Realtime rows carry every column (including the Yjs snapshot); keep the list fields.
function listFields(row) {
  const fields = Object.fromEntries(NOTE_LIST_COLUMNS.split(",").map((key) => [key, row[key]]));
  // The live overlay is kept while this tab is the one typing.
  return { ...fields, _local: false };
}
