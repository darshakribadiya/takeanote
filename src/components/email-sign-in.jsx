"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { APP_NAME } from "@/constants";
import { addEmailToGuest, signInWithEmail } from "@/lib/notes/api";

const COPY = {
  signin: {
    title: `Welcome to ${APP_NAME}`,
    text: "Enter your email to continue. New here? The same step creates your account.",
    action: "Continue",
  },
  share: {
    title: "Open shared note",
    text: "Enter your email to open the note that was shared with you.",
    action: "Open note",
  },
  upgrade: {
    title: "Add your email",
    text: "An email is now required. Add yours to keep every note you wrote as a guest.",
    action: "Save email",
  },
};

/*
 * Email is required; there is no verification step for now (see
 * signInWithEmail). `mode`: signin | share | upgrade (guest from before).
 */
export function EmailSignIn({ mode = "signin", onSignedIn }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | error
  const [error, setError] = useState(null);
  const copy = COPY[mode] ?? COPY.signin;

  async function submit(event) {
    event.preventDefault();
    setState("sending");
    setError(null);
    try {
      const user = mode === "upgrade" ? await addEmailToGuest(email) : await signInWithEmail(email);
      onSignedIn?.(user);
    } catch (submitError) {
      setError(submitError?.message ?? "Something went wrong. Try again.");
      setState("error");
    }
  }

  return (
    <form className="flex w-full max-w-sm flex-col gap-4" onSubmit={submit}>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary-600 text-white">
          <Icon className="size-5" icon={mode === "share" ? "mdi:link-variant" : "mdi:lightning-bolt-outline"} />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-semibold">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.text}</p>
        </div>
      </div>
      <Input
        aria-label="Email"
        autoComplete="email"
        autoFocus
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        required
        type="email"
        value={email}
      />
      {state === "error" && (
        <p className="text-sm text-destructive-foreground" role="alert">
          {error}
        </p>
      )}
      <Button disabled={state === "sending"} type="submit">
        {state === "sending" && <Spinner />}
        {copy.action}
      </Button>
    </form>
  );
}
