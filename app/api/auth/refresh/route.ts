import { createRefreshAuthRouter } from "@insforge/sdk/ssr";

export const { POST } = createRefreshAuthRouter({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL,
  anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
});
