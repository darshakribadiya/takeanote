"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { ensureSession } from "@/lib/notes/api";

// Sign-in / sign-up form; already signed-in visitors go straight to their notes.
export function LoginPanel() {
  const router = useRouter();

  useEffect(() => {
    ensureSession()
      .then((user) => user && router.replace("/"))
      .catch(() => {});
  }, [router]);

  function openNotes() {
    // The server now sees the session cookie, so "/" serves the app instead of the landing page.
    router.replace("/");
    router.refresh();
  }

  return <AuthForm onSignedIn={openNotes} />;
}
