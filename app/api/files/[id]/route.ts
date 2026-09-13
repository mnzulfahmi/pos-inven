import { rpc, serverClient, failure } from "@/lib/insforge/server";
import { z } from "zod";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const file = await rpc("nusa_file_lookup", { i: z.uuid().parse(id) });
    const { data, error } = await (
      await serverClient()
    ).storage
      .from("nusa-private")
      .download(file.key);
    if (error) throw new Error(error.message);
    const inline =
      new URL(request.url).searchParams.get("view") === "1" &&
      file.mime.startsWith("image/");
    return new Response(data, {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": inline
          ? 'inline; filename="gambar-produk"'
          : 'attachment; filename="bukti"',
        "Cache-Control": inline ? "private, max-age=3600" : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
