import { revalidateTag } from "next/cache";
import { connection } from "next/server";
import { z } from "zod";
import { isSameOrigin, readBodyCapped } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CMS_TAGS } from "@/modules/cms/server/queries";
import { MEDIA_MAX_UPLOAD_BYTES } from "@/modules/core/media";
import { getAccount } from "@/modules/core/server/auth";
import { deleteStoredImage, MediaError, processImage, storeImage } from "@/modules/core/server/media";
import { subjectHash, withinRateLimits } from "@/modules/core/server/request";

/** Room for the multipart envelope and the small text fields around the file. */
const MAX_BODY = MEDIA_MAX_UPLOAD_BYTES + 64 * 1024;

const TARGETS = {
  auction: { permission: "auction.listings.manage", rpc: "auction_admin_media_add", param: "p_auction" },
  pool: { permission: "poolx.pools.manage", rpc: "poolx_admin_media_add", param: "p_pool" },
  cms: { permission: "cms.content.manage", rpc: "cms_admin_cover_set", param: "p_document" },
} as const;

const fieldsSchema = z.object({
  target: z.enum(["auction", "pool", "cms"]),
  id: z.uuid(),
  alt: z.string().trim().min(3, "Describe the photo in at least 3 characters.").max(200),
});

const noStore = { "Cache-Control": "no-store" };
const fail = (status: number, error: string) => Response.json({ error }, { status, headers: noStore });

/**
 * Staff photo upload (TD-74, TD-75). multipart/form-data with `target` (auction | pool | cms), `id`, `alt` and `file`.
 * The image is re-encoded server-side; the database call runs with the staff member's own session, so permissions,
 * MFA and the draft-only rule are enforced in SQL as well as here.
 */
export async function POST(request: Request) {
  await connection();
  if (!isSameOrigin(request)) return fail(403, "Cross-site uploads are not allowed.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return fail(413, "Photos can be 10 MB at most.");

  const account = await getAccount();
  if (!account || !account.isStaff || account.aal !== "aal2") return fail(403, "Sign in as staff with MFA to upload.");

  const body = await readBodyCapped(request, MAX_BODY);
  if (body === null) return fail(413, "Photos can be 10 MB at most.");

  let form: FormData;
  try {
    form = await new Response(new Uint8Array(body), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return fail(400, "Send the photo as a form upload.");
  }
  const parsed = fieldsSchema.safeParse({ target: form.get("target"), id: form.get("id"), alt: form.get("alt") });
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Check the photo details.");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(400, "Choose a photo to upload.");

  const target = TARGETS[parsed.data.target];
  if (!account.permissions.includes(target.permission)) return fail(403, "You don’t have permission to do that.");

  const allowed = await withinRateLimits([
    { bucket: `media:user:${subjectHash("user", account.id)}`, max: 60, windowSeconds: 3600 },
  ]);
  if (!allowed) return fail(429, "Too many uploads. Please wait a while and try again.");

  let mediaId: string | null = null;
  try {
    const image = await processImage(Buffer.from(await file.arrayBuffer()));
    mediaId = await storeImage(image);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.schema("api").rpc(target.rpc, {
      [target.param]: parsed.data.id,
      p: {
        id: mediaId,
        width: image.width,
        height: image.height,
        thumbWidth: image.thumbWidth,
        thumbHeight: image.thumbHeight,
        bytes: image.display.byteLength,
        alt: parsed.data.alt,
      },
    } as never);
    if (error) {
      await deleteStoredImage(mediaId);
      const message = error.message?.includes(":") ? error.message.split(":").slice(1).join(":").trim() : null;
      if (error.code === "42501") return fail(403, "You don’t have permission to do that.");
      return fail(400, message ?? "The photo could not be added.");
    }
    if (parsed.data.target === "cms") {
      // A cover replaces the previous one: delete its files and refresh the cached blog / page data.
      const { media, replacedId } = data as { media: unknown; replacedId: string | null };
      if (replacedId) await deleteStoredImage(replacedId);
      revalidateTag(CMS_TAGS.docs, { expire: 0 });
      return Response.json({ media }, { status: 201, headers: noStore });
    }
    return Response.json({ media: data }, { status: 201, headers: noStore });
  } catch (error) {
    if (mediaId) await deleteStoredImage(mediaId);
    if (error instanceof MediaError) return fail(error.code === "STORAGE" ? 502 : 400, error.message);
    throw error;
  }
}
