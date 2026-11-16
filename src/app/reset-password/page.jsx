import { APP_NAME } from "@/constants";
import { ResetPasswordForm } from "./_components/reset-password-form";

export const metadata = { title: `Reset password · ${APP_NAME}` };

// Reached from the emailed reset link, after /auth/callback has signed the user in.
export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <ResetPasswordForm />
    </div>
  );
}
