import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@insforge/sdk/ssr/middleware';

const BASE_URL = process.env.NEXT_PUBLIC_INSFORGE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY;

// Perubahan: hanya halaman autentikasi dan undangan yang dapat dibuka tanpa login.
// Semua rute halaman lain otomatis terlindungi, termasuk rute baru/custom.
const PUBLIC_ROUTES = new Set([
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/invite",
]);

export async function proxy(request: NextRequest) {
  // Skip session refresh if InsForge env vars are absent (e.g. during build)
  // to prevent "Missing InsForge baseUrl or anonKey" errors on first load.
  if (!BASE_URL || !ANON_KEY) {
    return NextResponse.next();
  }

  const provisional = NextResponse.next();

  // Perubahan: gunakan hasil refresh sesi untuk menentukan status login
  // sebelum komponen halaman sempat dirender di browser.
  const { accessToken } = await updateSession({
    baseUrl: BASE_URL,
    anonKey: ANON_KEY,
    requestCookies: request.cookies,
    responseCookies: provisional.cookies,
  });

  const pathname = request.nextUrl.pathname.replace(/\/$/, "") || "/";
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);
  const isApiRoute = pathname === "/api" || pathname.startsWith("/api/");

  // Perubahan: pengunjung tanpa sesi langsung diarahkan ke login. API tidak
  // dialihkan agar Route Handler tetap dapat mengembalikan respons JSON 401.
  const response =
    !accessToken && !isPublicRoute && !isApiRoute
      ? NextResponse.redirect(new URL("/login", request.url))
      : NextResponse.next({ request });

  // Tetap kirim cookie baru/yang dihapus oleh updateSession pada semua respons,
  // termasuk respons redirect, agar keadaan sesi browser selalu sinkron.
  for (const cookie of provisional.cookies.getAll()) {
    response.cookies.set(cookie);
  }
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.svg|.*\\.(?:png|jpg|svg|woff2|html)$).*)'] };
