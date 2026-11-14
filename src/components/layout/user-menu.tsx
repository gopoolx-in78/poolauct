import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAccount } from "@/modules/core/server/auth";
import { NotificationsLink } from "./notifications-link";
import { UserMenuButton } from "./user-menu-button";

/** Unread in-app notifications of the signed-in user (0 when the count cannot be read). */
async function unreadCount() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.schema("api").rpc("notifications_unread_count");
  return !error && typeof data === "number" && data > 0 ? data : 0;
}

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
  const unread = await unreadCount();
  return (
    <div className="flex items-center gap-1">
      <NotificationsLink initial={unread} />
      <UserMenuButton name={account.displayName || account.email} isStaff={account.isStaff} />
    </div>
  );
}

export function UserMenuFallback() {
  return <span aria-hidden="true" className="inline-block h-11 w-16" />;
}
