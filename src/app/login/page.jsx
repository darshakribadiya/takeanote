import Link from "next/link";
import { Logo } from "@/components/logo";
import { APP_NAME } from "@/constants";
import { LoginPanel } from "./_components/login-panel";

export const metadata = {
  title: "Sign in",
  description: `Sign in to ${APP_NAME} or create a free account to start writing.`,
  alternates: { canonical: "/login" },
};

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center px-5">
        <Link aria-label={`${APP_NAME} home`} href="/">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center p-4 pb-16">
        <LoginPanel />
      </main>
    </div>
  );
}
