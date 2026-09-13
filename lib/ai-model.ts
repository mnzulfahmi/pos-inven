/** Fail closed: never silently route a free-model request to a paid model. */
export function freeModel(configured?: string) {
  const model = configured?.trim() || "openrouter/free";
  if (
    model !== "openrouter/free" &&
    (!model.endsWith(":free") || model.startsWith("openrouter/auto"))
  ) {
    throw new Error(
      "FREE_MODEL_REQUIRED: Konfigurasi AI hanya mengizinkan model gratis OpenRouter.",
    );
  }
  return model;
}
