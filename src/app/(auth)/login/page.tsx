import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in", alternates: { canonical: "/login" } };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-4xl">Sign in</h1>
      <p className="text-ink-muted mt-2">One account for PoolX and Auctions.</p>
      <div className="mt-8">
        <Suspense fallback={<Skeleton className="h-72" />}>
          <LoginForm />
        </Suspense>
      </div>
      <p className="text-ink-muted mt-8 text-sm">
        New here?{" "}
        <Link href="/register" className="text-ink underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </>
  );
}
