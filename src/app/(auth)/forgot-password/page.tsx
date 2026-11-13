import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata = { title: "Reset your password", alternates: { canonical: "/forgot-password" } };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-4xl">Reset your password</h1>
      <p className="text-ink-muted mt-2">Enter your account email and we&rsquo;ll send you a one-time reset link.</p>
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
      <p className="text-ink-muted mt-8 text-sm">
        <Link href="/login" className="text-ink underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
