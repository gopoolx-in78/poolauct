"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/modules/core/server/auth";
import { outcome, str } from "../action-kit";

export async function setSellerStatusAction(formData: FormData) {
  await requireStaff("/admin/sellers", "sellers.manage");
  const domain = z.enum(["poolx", "auction"]).parse(str(formData, "domain"));
  const seller = z.uuid().parse(str(formData, "sellerId"));
  const status = z.enum(["VERIFIED", "UNVERIFIED", "SUSPENDED"]).parse(str(formData, "status"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.schema("api").rpc("admin_set_seller_status", {
    p_domain: domain,
    p_seller: seller,
    p_status: status,
    p_note: str(formData, "note"),
  });
  redirect(outcome("/admin/sellers", error, "seller-updated"));
}
