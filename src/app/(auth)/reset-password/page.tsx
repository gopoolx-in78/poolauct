import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Choose a new password", alternates: { canonical: "/reset-password" } };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="text-4xl">Choose a new password</h1>
      <p className="text-ink-muted mt-2">After you save it, you&rsquo;ll be signed out everywhere else.</p>
      <div className="mt-8">
        <ResetPasswordForm />
      </div>
    </>
  );
}
