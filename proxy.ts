import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@insforge/sdk/ssr/middleware';

const BASE_URL = process.env.NEXT_PUBLIC_INSFORGE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;

export async function proxy(request: NextRequest) {
  // Skip session refresh if InsForge env vars are absent (e.g. during build)
  // to prevent "Missing InsForge baseUrl or anonKey" errors on first load.
  if (!BASE_URL || !ANON_KEY) {
    return NextResponse.next();
  }

  const provisional = NextResponse.next();
  await updateSession({
    baseUrl: BASE_URL,
    anonKey: ANON_KEY,
    requestCookies: request.cookies,
    responseCookies: provisional.cookies,
  });
  const response = NextResponse.next({ request });
  for (const cookie of provisional.cookies.getAll()) response.cookies.set(cookie);
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.svg|.*\\.(?:png|jpg|svg|woff2)$).*)'] };
