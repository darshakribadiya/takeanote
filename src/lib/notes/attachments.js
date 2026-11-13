import { createClient } from "@/lib/supabase/client";

const BUCKET = "attachments";
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/*
 * Storage paths start with the note id so the bucket policies can ask
 * `note_role(<note id>)`. Example: "9f1c…/4ab2…/meeting-notes.pdf"
 */
function storagePath(noteId, fileName) {
  const safeName = fileName.replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").slice(-120) || "file";
  return `${noteId}/${crypto.randomUUID()}/${safeName}`;
}

/*
 * Stable in-app URL for a stored file. The route behind it checks access
 * and redirects to a short-lived signed URL, so links in the document
 * never expire. Example: "/a/9f1c…/4ab2…/photo.png"
 */
export function attachmentUrl(path, { download = false } = {}) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `/a/${encoded}${download ? "?download=1" : ""}`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/*
 * Uploads one file for a note. `ensurePersisted` must run first: the
 * storage policy only admits files for notes that exist in the database.
 */
export async function uploadAttachment(noteId, file, { ensurePersisted } = {}) {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${file.name} is larger than ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
  }
  await ensurePersisted?.();
  const path = storagePath(noteId, file.name);
  const { error } = await createClient()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw error;
  return {
    path,
    url: attachmentUrl(path),
    name: file.name,
    size: file.size,
    mime: file.type,
  };
}
