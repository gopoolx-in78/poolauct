"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { deleteStoredImage } from "@/modules/core/server/media";
import { outcome, str } from "./action-kit";

const TARGETS = {
  auction: { permission: "auction.listings.manage", path: "/admin/auctions/", prefix: "auction" },
  pool: { permission: "poolx.pools.manage", path: "/admin/poolx/", prefix: "poolx" },
} as const;

function parse(formData: FormData) {
  const target = TARGETS[z.enum(["auction", "pool"]).parse(str(formData, "target"))];
  const ownerId = z.uuid().parse(str(formData, "ownerId"));
  const mediaId = z.uuid().parse(str(formData, "mediaId"));
  return { target, ownerId, mediaId };
}

/** Changes a photo's alt text and / or moves it up or down (draft listings only; enforced in SQL). */
export async function updateMediaAction(formData: FormData) {
  const { target, ownerId, mediaId } = parse(formData);
  await requireStaff(`${target.path}${ownerId}`, target.permission);
  const move = z
    .enum(["up", "down"])
    .nullable()
    .parse(str(formData, "move") || null);
  const alt = move ? null : str(formData, "alt");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema("api")
    .rpc(`${target.prefix}_admin_media_update`, { p_media: mediaId, p_alt: alt, p_move: move });
  redirect(outcome(`${target.path}${ownerId}`, error, move ? "photo-moved" : "photo-saved"));
}

/** Removes a photo: SQL unlinks it and marks it REMOVED, then both files are deleted from Storage. */
export async function removeMediaAction(formData: FormData) {
  const { target, ownerId, mediaId } = parse(formData);
  await requireStaff(`${target.path}${ownerId}`, target.permission);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc(`${target.prefix}_admin_media_remove`, { p_media: mediaId });
  if (!error) await deleteStoredImage(mediaId);
  redirect(outcome(`${target.path}${ownerId}`, error, "photo-removed"));
}
