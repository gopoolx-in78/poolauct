import Link from "next/link";

export const metadata = { title: "Check your email", alternates: { canonical: "/verify-email" } };

export default function VerifyEmailPage() {
  return (
    <>
      <h1 className="text-4xl">Check your email</h1>
      <p className="mt-4 text-lg">
        If that address can be registered, we&rsquo;ve sent a confirmation link to it. Open the link to activate your
        account, then sign in.
      </p>
      <p className="text-ink-muted mt-4">
        Didn&rsquo;t get it? Check your spam folder. Links expire after a while — you can sign up again to get a new
        one.
      </p>
      <p className="mt-8">
        <Link href="/login" className="underline underline-offset-4">
          Go to sign in
        </Link>
      </p>
    </>
  );
}
