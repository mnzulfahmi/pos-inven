import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@insforge/sdk";
import { createServerClient } from "@insforge/sdk/ssr";
export const serverClient = async () =>
  createServerClient({ cookies: await cookies() });
export async function rpc(name: string, args: Record<string, unknown> = {}) {
  const client = await serverClient();
  const { data, error } = await client.database.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export async function adminRpc(
  name: string,
  args: Record<string, unknown> = {},
) {
  const baseUrl =
    process.env.INSFORGE_URL || process.env.NEXT_PUBLIC_INSFORGE_URL;
  const apiKey = process.env.INSFORGE_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("INSFORGE_ADMIN_CONFIG_MISSING");
  const client = createAdminClient({ baseUrl, apiKey });
  const { data, error } = await client.database.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export function resolveTenantId(
  session: { tenants?: { id: string }[] },
  preferred?: string,
) {
  const id =
    session.tenants?.find((tenant) => tenant.id === preferred)?.id ||
    session.tenants?.[0]?.id;
  if (!id) throw new Error("ONBOARDING_REQUIRED");
  return id;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const forwardedHost =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  const forwardedProto =
    request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const allowed = new Set([url.origin]);
  if (forwardedHost) allowed.add(`${forwardedProto}://${forwardedHost}`);
  if (process.env.NEXT_PUBLIC_APP_URL) {
    allowed.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
  }
  if (!origin || !allowed.has(origin)) throw new Error("INVALID_ORIGIN");
}
export function failure(e: unknown) {
  const upstreamStatus =
    e && typeof e === "object" && "statusCode" in e
      ? Number(e.statusCode)
      : undefined;
  const message =
    e && typeof e === "object" && "message" in e
      ? String(e.message)
      : "REQUEST_FAILED";
  const status =
    upstreamStatus && upstreamStatus >= 400 && upstreamStatus <= 599
      ? upstreamStatus
      : /LOGIN|JWT|token.*expired|invalid email or password/i.test(message)
        ? 401
        : /FORBIDDEN|OWNER_REQUIRED|OPERATOR_REQUIRED|permission/i.test(message)
          ? 403
          : /CONFLICT|CHANGED|EXPIRED|RECOUNT|duplicate key|ALREADY_POSTED/i.test(
                message,
              )
            ? 409
            : /QUOTA|LIMIT/i.test(message)
              ? 429
              : 422;
  return Response.json(
    {
      error: message,
      code: message.match(/^[A-Z_]+$/)?.[0] || "REQUEST_FAILED",
      requestId: crypto.randomUUID(),
      retryable: [409, 429].includes(status),
    },
    { status },
  );
}
