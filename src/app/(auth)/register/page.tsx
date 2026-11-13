import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Create an account", alternates: { canonical: "/register" } };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-4xl">Create an account</h1>
      <p className="text-ink-muted mt-2">
        Use one account to join buying pools and take part in auctions. We&rsquo;ll ask for more verification only when
        an activity needs it.
      </p>
      <div className="mt-8">
        <RegisterForm />
      </div>
      <p className="text-ink-muted mt-8 text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </>
  );
}
