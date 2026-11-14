import { connection } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const noStore = { "Cache-Control": "no-store, private" };

/** Unread in-app notification count of the signed-in user, for the header badge (8.11). */
export async function GET() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401, headers: noStore });
  const { data, error } = await supabase.schema("api").rpc("notifications_unread_count");
  if (error || typeof data !== "number") {
    return Response.json({ error: "Could not load notifications." }, { status: 503, headers: noStore });
  }
  return Response.json({ unread: Math.max(0, data) }, { headers: noStore });
}
