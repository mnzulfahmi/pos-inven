import {
  rpc,
  serverClient,
  failure,
  sameOrigin,
  resolveTenantId,
} from "@/lib/insforge/server";
import { cookies } from "next/headers";
import { z } from "zod";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (Number(request.headers.get("content-length")) > 5100000)
      throw new Error("FILE_TOO_LARGE");
    const form = await request.formData(),
      file = form.get("file"),
      purpose = z
        .enum(["invoice", "product"])
        .parse(form.get("purpose") || "invoice");
    if (!(file instanceof File) || file.size < 1 || file.size > 5000000)
      throw new Error("INVALID_FILE");
    const signatures = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const valid =
      file.type === "image/png"
        ? signatures[0] === 137 && signatures[1] === 80
        : file.type === "image/jpeg"
          ? signatures[0] === 255 && signatures[1] === 216
          : file.type === "application/pdf"
            ? String.fromCharCode(...signatures.slice(0, 5)) === "%PDF-"
            : false;
    if (!valid) throw new Error("INVALID_FILE_TYPE");
    if (purpose === "product" && !file.type.startsWith("image/"))
      throw new Error("INVALID_PRODUCT_IMAGE");
    const session = await rpc("nusa_session");
    const t = resolveTenantId(
      session,
      (await cookies()).get("nusa_tenant")?.value,
    );
    const snapshot = await rpc("nusa_snapshot", { t });
    if (snapshot.role !== "owner") throw new Error("OWNER_REQUIRED");
    const client = await serverClient(),
      key =
        t +
        "/" +
        crypto.randomUUID() +
        {
          "image/png": ".png",
          "image/jpeg": ".jpg",
          "application/pdf": ".pdf",
        }[file.type];
    const { data, error } = await client.storage
      .from("nusa-private")
      .upload(key, file);
    if (error) throw new Error(error.message);
    const id = await rpc("nusa_file_register", {
      t,
      p: {
        key: data!.key,
        url: data!.url,
        mime: file.type,
        size: file.size,
        purpose,
      },
    });
    return Response.json({ id, src: `/api/files/${id}?view=1` });
  } catch (e) {
    return failure(e);
  }
}
