"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { APP_NAME, MIN_PASSWORD_LENGTH, SESSION_DAYS } from "@/constants";
import {
  addEmailToGuest,
  MAX_NAME_LENGTH,
  sendPasswordReset,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/notes/api";

const COPY = {
  signin: {
    title: `Welcome to ${APP_NAME}`,
    text: `Sign in with your email and password.`,
    action: "Sign in",
  },
  share: {
    title: "Open shared note",
    text: "Sign in to open the note that was shared with you.",
    action: "Sign in",
  },
  signup: {
    title: "Create your account",
    text: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`,
    action: "Create account",
  },
  forgot: {
    title: "Reset your password",
    text: "Enter your email and we'll send you a link to choose a new password.",
    action: "Send reset link",
  },
  upgrade: {
    title: "Add your email",
    text: "An account is now required. Add an email and password to keep every note you wrote as a guest.",
    action: "Save account",
  },
};

/*
 * Email + password sign-in with "create account" and "forgot password"
 * views. `mode`: signin | share | upgrade (guest from before).
 */
export function AuthForm({ mode = "signin", onSignedIn }) {
  const [view, setView] = useState(mode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // A failed email link lands on "/?auth_error=..." (see app/auth/callback).
  const [message, setMessage] = useState(readLinkError);
  const [state, setState] = useState(() => (readLinkError() ? "error" : "idle")); // idle | sending | error | sent
  const copy = COPY[view] ?? COPY.signin;
  const needsPassword = view !== "forgot";
  const isNewPassword = view === "signup" || view === "upgrade";

  function switchView(next) {
    setView(next);
    setState("idle");
    setMessage(null);
    setPassword("");
  }

  async function submit(event) {
    event.preventDefault();
    setState("sending");
    setMessage(null);
    try {
      if (view === "forgot") {
        await sendPasswordReset(email);
        setState("sent");
        setMessage("If an account exists for this email, a reset link is on its way. Check your inbox.");
        return;
      }
      if (view === "signup") {
        const user = await signUpWithPassword(email, password, fullName);
        if (!user) {
          setState("sent");
          setMessage("Almost done: open the link we emailed you to confirm your account.");
          return;
        }
        onSignedIn?.(user);
        return;
      }
      const user = view === "upgrade" ? await addEmailToGuest(email, password, fullName) : await signInWithPassword(email, password);
      onSignedIn?.(user);
    } catch (submitError) {
      setMessage(submitError?.message ?? "Something went wrong. Try again.");
      setState("error");
    }
  }

  return (
    <form className="flex w-full max-w-sm flex-col gap-4" onSubmit={submit}>
      <div className="flex flex-col items-center gap-3 text-center">
        {view === "forgot" || mode === "share" ? (
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-600 text-white">
            <Icon className="size-5" icon={view === "forgot" ? "mdi:lock-reset" : "mdi:link-variant"} />
          </span>
        ) : (
          <LogoMark size={40} />
        )}
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-xl font-semibold">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.text}</p>
        </div>
      </div>

      {isNewPassword && (
        <Field>
          <FieldLabel>Full name</FieldLabel>
          <Input
            autoComplete="name"
            autoFocus
            maxLength={MAX_NAME_LENGTH}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="John Doe"
            required
            value={fullName}
          />
        </Field>
      )}

      <Field>
        <FieldLabel>Email</FieldLabel>
        <Input
          autoComplete="email"
          autoFocus={!isNewPassword}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
      </Field>

      {needsPassword && (
        <Field>
          <div className="flex w-full items-center justify-between">
            <FieldLabel>Password</FieldLabel>
            {(view === "signin" || view === "share") && (
              <button
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => switchView("forgot")}
                type="button"
              >
                Forgot password?
              </button>
            )}
          </div>
          <div className="relative w-full">
            <Input
              autoComplete={isNewPassword ? "new-password" : "current-password"}
              className="pe-8"
              minLength={isNewPassword ? MIN_PASSWORD_LENGTH : undefined}
              onChange={(event) => setPassword(event.target.value)}
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 end-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((value) => !value)}
              type="button"
            >
              <Icon icon={showPassword ? "mdi:eye-off-outline" : "mdi:eye-outline"} />
            </button>
          </div>
        </Field>
      )}

      {message && (
        <p
          className={state === "error" ? "text-sm text-destructive-foreground" : "text-sm text-muted-foreground"}
          role={state === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      )}

      {state !== "sent" && (
        <Button disabled={state === "sending"} type="submit">
          {state === "sending" && <Spinner />}
          {copy.action}
        </Button>
      )}

      {view !== "upgrade" && (
        <p className="text-center text-sm text-muted-foreground">
          {view === "signup" ? (
            <>
              Already have an account? <TextLink onClick={() => switchView("signin")}>Sign in</TextLink>
            </>
          ) : view === "forgot" ? (
            <TextLink onClick={() => switchView("signin")}>Back to sign in</TextLink>
          ) : (
            <>
              New here? <TextLink onClick={() => switchView("signup")}>Create an account</TextLink>
            </>
          )}
        </p>
      )}
    </form>
  );
}

function readLinkError() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("auth_error");
}

function TextLink({ children, onClick }) {
  return (
    <button className="font-medium text-foreground underline-offset-4 hover:underline" onClick={onClick} type="button">
      {children}
    </button>
  );
}
