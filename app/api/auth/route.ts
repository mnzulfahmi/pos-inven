import { createAuthActions } from "@insforge/sdk/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { failure, sameOrigin, serverClient } from "@/lib/insforge/server";
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const p = await request.json();
    const response = NextResponse.json({ ok: true });
    const auth = createAuthActions({
      requestCookies: request.cookies,
      responseCookies: response.cookies,
    });
    const client = await serverClient();
    const email = p.op === "logout" ? "" : z.email().parse(p.email);
    let result;
    switch (p.op) {
      case "login":
        result = await auth.signInWithPassword({
          email,
          password: z.string().min(1).max(200).parse(p.password),
        });
        break;
      case "register":
        result = await auth.signUp({
          email,
          password: z.string().min(8).max(200).parse(p.password),
          name: z.string().min(1).max(100).parse(p.name),
        });
        break;
      case "verify-email":
        result = await auth.verifyEmail({
          email,
          otp: z.string().min(4).max(12).parse(p.code),
        });
        break;
      case "resend":
        result = await client.auth.resendVerificationEmail({ email });
        break;
      case "forgot-password":
        result = await client.auth.sendResetPasswordEmail({ email });
        break;
      case "reset-password": {
        const exchanged = await client.auth.exchangeResetPasswordToken({
          email,
          code: z.string().min(4).max(12).parse(p.code),
        });
        if (exchanged.error) throw exchanged.error;
        result = await client.auth.resetPassword({
          otp: exchanged.data!.token,
          newPassword: z.string().min(8).max(200).parse(p.password),
        });
        break;
      }
      case "logout":
        result = await auth.signOut();
        break;
      default:
        throw new Error("INVALID_OPERATION");
    }
    if (result.error) throw result.error;
    return response;
  } catch (e) {
    const raw =
      e && typeof e === "object" && "message" in e
        ? String(e.message)
        : "REQUEST_FAILED";
    const message = /invalid credentials/i.test(raw)
      ? "Email atau kata sandi salah."
      : /user already exists|already registered/i.test(raw)
        ? "Email sudah terdaftar. Silakan masuk atau gunakan pemulihan kata sandi."
        : /not verified|verify.*email/i.test(raw)
          ? "Email belum diverifikasi. Masukkan kode verifikasi yang dikirim ke email Anda."
          : /invalid.*(?:otp|code)|expired.*(?:otp|code)/i.test(raw)
            ? "Kode tidak valid atau sudah kedaluwarsa. Minta kode baru lalu coba lagi."
            : /too many|rate.?limit/i.test(raw)
              ? "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi."
              : raw;
    const statusCode =
      e && typeof e === "object" && "statusCode" in e
        ? Number(e.statusCode)
        : undefined;
    return failure({ message, statusCode });
  }
}
