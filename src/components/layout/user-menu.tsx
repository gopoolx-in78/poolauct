import Link from "next/link";
import { getAccount } from "@/modules/core/server/auth";
import { UserMenuButton } from "./user-menu-button";

/** Server part: resolves the session. Rendered behind <Suspense> in the header. */
export async function UserMenu() {
  const account = await getAccount();
  if (!account) {
    return (
      <Link href="/login" className="hover:bg-ink/5 inline-flex h-11 items-center rounded px-3 text-sm font-medium">
        Sign in
      </Link>
    );
  }
  return <UserMenuButton name={account.displayName || account.email} isStaff={account.isStaff} />;
}

export function UserMenuFallback() {
  return <span aria-hidden="true" className="inline-block h-11 w-16" />;
}
