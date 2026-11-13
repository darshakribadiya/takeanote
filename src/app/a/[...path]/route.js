import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SIGNED_URL_SECONDS = 60 * 60;

/*
 * Serves a note attachment: checks access with the visitor's own session
 * (storage policies use note_role) and redirects to a signed URL.
 * Example: GET /a/<note id>/<uuid>/photo.png
 */
export async function GET(request, { params }) {
  const { path } = await params;
  const objectPath = path.map(decodeURIComponent).join("/");
  const download = new URL(request.url).searchParams.has("download");

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(objectPath, SIGNED_URL_SECONDS, download ? { download: true } : undefined);

  if (error || !data?.signedUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  const response = NextResponse.redirect(data.signedUrl, 302);
  // Browsers may reuse the redirect while the signed URL is still valid.
  response.headers.set("Cache-Control", `private, max-age=${SIGNED_URL_SECONDS - 300}`);
  return response;
}
