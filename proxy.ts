import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@insforge/sdk/ssr/middleware';
export async function proxy(request: NextRequest) {
  const provisional = NextResponse.next();
  await updateSession({ requestCookies: request.cookies, responseCookies: provisional.cookies });
  const response = NextResponse.next({ request });
  for (const cookie of provisional.cookies.getAll()) response.cookies.set(cookie);
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.svg|.*\\.(?:png|jpg|svg|woff2)$).*)'] };
