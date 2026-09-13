export type ReadToolName =
  "sales_summary" | "stock_forecast" | "stock_levels" | "product_ranking";

export type ProposalToolName = "propose_purchase" | "propose_stock_count";

export type ModelToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

const normalized = (question: string) => question.toLocaleLowerCase("id-ID");

const searchable = (value: string) =>
  normalized(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type StockProductReference = {
  id: string;
  name: string;
  variant?: string;
  sku?: string;
  barcode?: string;
};

export function relativeStockChangeFor(question: string): number | null {
  const q = normalized(question);
  const positive = /\b(tambah(?:kan)?|masuk|bertambah|restok|restock)\b/.exec(
    q,
  );
  const negative = /\b(kurangi|kurangkan|keluar|berkurang)\b/.exec(q);
  if ((!positive && !negative) || (positive && negative)) return null;
  const direction = positive || negative!;
  const quantities = [
    ...q.matchAll(
      /\b(\d+(?:[.,]\d+)?)\s*(?:pcs?|unit|buah|botol|bungkus|pak|pack|dus|kotak|kg|gram)\b/g,
    ),
  ];
  const nearest = quantities.sort(
    (a, b) =>
      Math.abs((a.index || 0) - (direction.index || 0)) -
      Math.abs((b.index || 0) - (direction.index || 0)),
  )[0];
  const fallback = q
    .slice(direction.index! + direction[0].length)
    .match(/(?:sebanyak\s+)?(\d+(?:[.,]\d+)?)/);
  const amount = Number(
    (nearest?.[1] || fallback?.[1] || "").replace(",", "."),
  );
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000)
    return null;
  return (negative ? -1 : 1) * amount;
}

export function productReferenceFor(
  question: string,
  products: StockProductReference[],
): string | null {
  const q = searchable(question);
  const questionTokens = new Set(q.split(" ").filter(Boolean));
  const scored = products.flatMap((product) => {
    const name = searchable(product.name || "");
    const variant = searchable(product.variant || "");
    const sku = searchable(product.sku || "");
    const barcode = searchable(product.barcode || "");
    const nameTokens = name.split(" ").filter((token) => token.length >= 2);
    const variantTokens = variant
      .split(" ")
      .filter((token) => token.length >= 2);
    let score = 0;
    if (sku && questionTokens.has(sku)) score += 500;
    if (barcode && questionTokens.has(barcode)) score += 500;
    if (name && ` ${q} `.includes(` ${name} `)) score += 150;
    if (variant && ` ${q} `.includes(` ${variant} `)) score += 80;
    const matchingName = nameTokens.filter((token) =>
      questionTokens.has(token),
    );
    const matchingVariant = variantTokens.filter((token) =>
      questionTokens.has(token),
    );
    score += matchingName.length * 20 + matchingVariant.length * 12;
    if (nameTokens.length > 1 && matchingName.length === nameTokens.length)
      score += 40;
    if (variantTokens.length && matchingVariant.length === variantTokens.length)
      score += 25;
    return score >= 20 ? [{ id: product.id, score }] : [];
  });
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length || (scored[1] && scored[0].score === scored[1].score))
    return null;
  return scored[0].id;
}

export function proposalToolFor(question: string): ProposalToolName | null {
  const q = normalized(question);
  if (
    /\b(buat|buatkan|siapkan|susun|usulkan)\b[\s\S]*\b(po|purchase order|pembelian)\b/.test(
      q,
    )
  )
    return "propose_purchase";
  if (
    /\b(buat|buatkan|siapkan|susun|usulkan|catat)\b[\s\S]*\b(opname|stock count|koreksi stok)\b/.test(
      q,
    )
  )
    return "propose_stock_count";
  if (
    /\b(tambah(?:kan)?|kurangi|sesuaikan|ubah|catat|restok|restock)\b[\s\S]*\b(stok|stock|persediaan)\b/.test(
      q,
    ) ||
    /\b(restok|restock)\b[\s\S]*\b\d/.test(q) ||
    /\b(stok|stock|persediaan)\b[\s\S]*\b(masuk|keluar|bertambah|berkurang)\b/.test(
      q,
    )
  )
    return "propose_stock_count";
  return null;
}

export function proposalToolForContext(
  question: string,
  priorQuestions: string[],
  hasProductReference = false,
): ProposalToolName | null {
  const direct = proposalToolFor(question);
  if (direct) return direct;
  if (hasProductReference && relativeStockChangeFor(question) !== null)
    return "propose_stock_count";
  if (
    !/^(?:ya|iya|betul|benar|lanjut(?:kan)?|setuju|oke|ok|silakan)(?:\b|[.!])/i.test(
      question.trim(),
    )
  )
    return null;
  return priorQuestions.map(proposalToolFor).reverse().find(Boolean) || null;
}

export function readToolsFor(question: string, role: string): ReadToolName[] {
  const q = normalized(question);
  const proposal = proposalToolFor(question);
  const tools = new Set<ReadToolName>();
  const canReadReports = role === "owner" || role === "manager";

  if (
    proposal === "propose_purchase" ||
    /restock|re-?stock|stok (?:menipis|rendah|habis)|perlu (?:dibeli|dipesan)|reorder/.test(
      q,
    )
  )
    tools.add("stock_forecast");

  if (
    proposal === "propose_stock_count" ||
    (!tools.has("stock_forecast") &&
      /\b(stok|stock|inventor[yi]|persediaan|saldo barang|jumlah barang)\b/.test(
        q,
      ))
  )
    tools.add("stock_levels");

  if (
    canReadReports &&
    /\b(penjualan|sales|omzet|pendapatan|transaksi|refund|laba|profit|basket|keranjang)\b/.test(
      q,
    )
  )
    tools.add("sales_summary");

  if (
    canReadReports &&
    /produk[\s\S]*(laris|laku|teratas|terbaik)|\b(terlaris|ranking produk|top product)\b/.test(
      q,
    )
  )
    tools.add("product_ranking");

  return [...tools];
}

const number = (value: unknown) =>
  Math.round(Number(value || 0)).toLocaleString("id-ID");
const money = (value: unknown) => `Rp${number(value)}`;

export function plainModelText(value: unknown): string {
  return modelContentText(value)
    .replace(/<dots_function_call>[\s\S]*?<\/dots_function_call>/gi, "")
    .replace(/<function_call>[\s\S]*?<\/function_call>/gi, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .trim();
}

export function modelContentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return String(value || "");
  return value
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part)
        return String(part.text || "");
      return "";
    })
    .join("\n");
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function parseArguments(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function modelToolCalls(message: unknown): ModelToolCall[] {
  if (!message || typeof message !== "object") return [];
  const value = message as Record<string, any>;
  if (Array.isArray(value.tool_calls) && value.tool_calls.length) {
    return value.tool_calls.flatMap((call: any) => {
      const name = call?.function?.name;
      const args = parseArguments(call?.function?.arguments);
      return typeof name === "string" && args
        ? [{ name, arguments: args }]
        : [];
    });
  }
  if (value.function_call) {
    const name = value.function_call.name;
    const args = parseArguments(value.function_call.arguments);
    if (typeof name === "string" && args) return [{ name, arguments: args }];
  }

  const content = modelContentText(value.content);
  const block = content.match(
    /<(?:dots_)?function_call\b[^>]*>([\s\S]*?)<\/(?:dots_)?function_call>/i,
  )?.[1];
  if (!block) return [];
  const invoke = block.match(
    /<invoke\b[^>]*\bname=["']([a-zA-Z0-9_-]+)["'][^>]*>([\s\S]*?)<\/invoke>/i,
  );
  if (!invoke) return [];
  const args: Record<string, unknown> = {};
  const parameter =
    /<parameter\b[^>]*\bname=["']([a-zA-Z0-9_-]+)["'][^>]*>([\s\S]*?)<\/parameter>/gi;
  for (const match of invoke[2].matchAll(parameter)) {
    const raw = decodeXml(match[2]);
    args[match[1]] = /^-?(?:\d+\.?\d*|\.\d+)$/.test(raw) ? Number(raw) : raw;
  }
  return [{ name: invoke[1], arguments: args }];
}

export function factualFallback(
  data: Partial<Record<ReadToolName, any>>,
): string | null {
  const forecast = data.stock_forecast;
  if (forecast) {
    const items = Array.isArray(forecast.items) ? forecast.items : [];
    if (!items.length)
      return "Tidak ada produk yang berada pada atau di bawah batas stok minimum untuk outlet yang dipilih.";
    const rows = items.slice(0, 8).map((item: any) => {
      const name = item.product?.name || item.name || "Produk";
      return `• ${name}: stok ${number(item.stock)} unit, minimum ${number(item.minimum)} unit, saran restock ${number(item.recommended)} unit`;
    });
    return `Produk yang perlu diperhatikan:\n\n${rows.join("\n")}\n\nSaran dihitung dari stok, penjualan harian, lead time, stok pengaman, dan PO yang belum diterima. Tinjau jumlah sebelum membuat pembelian.`;
  }

  const ranking = data.product_ranking;
  if (ranking) {
    const items = (Array.isArray(ranking.items) ? ranking.items : [])
      .filter((item: any) => Number(item.units) > 0)
      .slice(0, 8);
    if (!items.length)
      return "Belum ada produk terjual pada periode dan outlet yang dipilih.";
    return `Produk terlaris berdasarkan nilai penjualan:\n\n${items
      .map(
        (item: any, index: number) =>
          `${index + 1}. ${item.name || "Produk"} — ${number(item.units)} unit, ${money(item.revenue)}`,
      )
      .join("\n")}`;
  }

  const summary = data.sales_summary;
  if (summary) {
    const growth =
      summary.salesGrowth == null
        ? "belum dapat dibandingkan dengan periode sebelumnya"
        : `${Number(summary.salesGrowth) >= 0 ? "naik" : "turun"} ${number(Math.abs(Number(summary.salesGrowth)))}% dari periode sebelumnya`;
    return `Penjualan bersih ${money(summary.sales)} dari ${number(summary.count)} transaksi, dengan rata-rata belanja ${money(summary.basket)}. Refund tercatat ${money(summary.refunds)} dan laba kotor ${money(summary.grossProfit)}. Penjualan ${growth}.`;
  }

  const levels = data.stock_levels;
  if (levels) {
    const items = Array.isArray(levels.items) ? levels.items : [];
    if (!items.length) return "Belum ada saldo stok untuk outlet yang dipilih.";
    return `Saldo stok saat ini:\n\n${items
      .slice(0, 10)
      .map(
        (item: any) =>
          `• ${item.name || "Produk"}: ${number(item.quantity)} unit`,
      )
      .join("\n")}`;
  }

  return null;
}
