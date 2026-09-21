const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
function load(file) {
  const context = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  return context.exports;
}
const { freeModel } = load("lib/ai-model.ts");
const { approvalTaskRequestFor, buildApprovalTasks, proposalReviewRequest } =
  load("lib/ai-tasks.ts");
const {
  aiInputCommand,
  buildAiInputTask,
  heuristicInputActionForName,
  implicitInputNameFor,
  inputActionIntentFor,
  normalizeAiInputValues,
} = load("lib/ai-input-actions.ts");
const {
  factualFallback,
  modelToolCalls,
  plainModelText,
  productReferenceFor,
  proposalToolFor,
  proposalToolForContext,
  readToolsFor,
  relativeStockChangeFor,
} = load("lib/ai-orchestration.ts");
assert.equal(freeModel(), "openrouter/free");
assert.equal(freeModel("  openrouter/free  "), "openrouter/free");
assert.equal(freeModel("test/model:free"), "test/model:free");
for (const model of [
  "openrouter/auto",
  "openrouter/auto:free",
  "test/paid",
  "test/free",
]) {
  assert.throws(() => freeModel(model), /FREE_MODEL_REQUIRED/);
}
const example = fs.readFileSync(".env.example", "utf8");
assert.ok(
  /^OPENROUTER_API_KEY=\s*$/m.test(example),
  "Example file must not contain a live key",
);
assert.equal(
  proposalToolFor("Buatkan draft PO untuk produk yang perlu direstock."),
  "propose_purchase",
);
assert.equal(
  proposalToolFor("Berapa stok yang tersedia?"),
  null,
  "A read-only question must not expose a proposal tool",
);
assert.equal(
  proposalToolFor("Tambahkan stok kopi 10 pcs karena barang masuk kemarin."),
  "propose_stock_count",
);
assert.equal(
  proposalToolFor("Restok Aqua 10 pcs dari pemasok."),
  "propose_stock_count",
);
assert.equal(relativeStockChangeFor("Stok Aqua masuk 10 pcs."), 10);
assert.equal(relativeStockChangeFor("Kurangi stok Aqua sebanyak 3 unit."), -3);
assert.equal(
  relativeStockChangeFor("Ubah stok Aqua menjadi 8 unit."),
  null,
  "An absolute count must not be mistaken for a relative adjustment",
);
const stockProducts = [
  {
    id: "aqua-600",
    name: "Aqua",
    variant: "600 ml",
    sku: "AQUA-600",
  },
  {
    id: "indomie",
    name: "Mie Goreng Indomie",
    variant: "Default",
    sku: "IND-001",
  },
];
assert.equal(
  productReferenceFor("Stok Indomie Goreng keluar 5 pcs", stockProducts),
  "indomie",
);
assert.equal(
  productReferenceFor("Berapa stok SKU AQUA-600?", stockProducts),
  "aqua-600",
);
assert.equal(
  proposalToolForContext("ya", [
    "Saya dapat stok mie goreng masuk 10 pcs dari pemasok kemarin",
    "betul",
  ]),
  "propose_stock_count",
);
assert.equal(
  proposalToolForContext("ya", ["Berapa stok yang tersedia?"]),
  null,
  "A generic confirmation must not enable a write tool without prior write intent",
);
assert.equal(
  proposalToolForContext("Mie Goreng Indomie keluar 5 pcs", [], true),
  "propose_stock_count",
  "A resolved product and relative movement should create a review even when the word stok is omitted",
);
assert.deepEqual(
  [...readToolsFor("Produk apa yang perlu direstock?", "owner")],
  ["stock_forecast"],
);
assert.deepEqual(
  [...readToolsFor("Bagaimana penjualan saya?", "cashier")],
  [],
  "Cashiers cannot request report data through the model",
);
assert.match(
  factualFallback({
    stock_forecast: {
      items: [{ name: "Kopi", stock: 2, minimum: 5, recommended: 12 }],
    },
  }),
  /Kopi: stok 2 unit, minimum 5 unit, saran restock 12 unit/,
);
assert.match(
  factualFallback({
    sales_summary: {
      sales: 100000,
      count: 4,
      basket: 25000,
      refunds: 0,
      grossProfit: 40000,
      salesGrowth: null,
    },
  }),
  /Penjualan bersih Rp100\.000 dari 4 transaksi/,
);
assert.equal(
  plainModelText("**Kopi**\n- stok `2` unit"),
  "Kopi\n• stok 2 unit",
);
const xmlToolCall = `<dots_function_call>
<invoke name="adjust_stock">
<parameter name="outlet_id">adf115c9-7667-451e-a42a-31f925d7868a</parameter>
<parameter name="product_id">e0a797e4-3cf6-455a-900b-0aafdc53c42e</parameter>
<parameter name="quantity">10</parameter>
<parameter name="reason">Stok masuk 10 pcs dari pemasok kemarin</parameter>
</invoke>
</dots_function_call>`;
const parsedXmlCalls = modelToolCalls({ content: xmlToolCall });
assert.equal(parsedXmlCalls.length, 1);
assert.equal(parsedXmlCalls[0].name, "adjust_stock");
assert.equal(parsedXmlCalls[0].arguments.quantity, 10);
assert.equal(
  parsedXmlCalls[0].arguments.reason,
  "Stok masuk 10 pcs dari pemasok kemarin",
);
assert.equal(plainModelText(xmlToolCall), "");
assert.equal(approvalTaskRequestFor("Apa yang perlu saya setujui?"), "all");
assert.equal(
  approvalTaskRequestFor("Tampilkan PO yang menunggu approval"),
  "purchase",
);
assert.equal(approvalTaskRequestFor("Berapa omzet hari ini?"), null);
assert.equal(proposalReviewRequest("Konfirmasi usulan tadi"), true);
const approvalTasks = buildApprovalTasks(
  {
    role: "manager",
    purchases: [
      {
        id: "po-1",
        status: "draft",
        outlet_id: "outlet-1",
        supplier_id: "supplier-1",
        version: 2,
        lines: [{ variant_id: "product-1", quantity: 3, cost: 5000 }],
      },
    ],
    counts: [],
  },
  [{ id: "product-1", name: "Kopi" }],
  [{ id: "supplier-1", name: "Supplier A" }],
  "all",
);
assert.equal(approvalTasks.length, 1);
assert.equal(
  approvalTasks[0].canApprove,
  false,
  "AI approvals are restricted to the business owner",
);
assert.equal(approvalTasks[0].payload.version, 2);
const inventoryTasks = buildApprovalTasks(
  {
    role: "inventory",
    purchases: [],
    counts: [
      {
        id: "count-1",
        status: "pending",
        outlet_id: "outlet-1",
        reason: "Hitungan fisik",
        lines: [{ variant_id: "product-1", expected: 4, physical: 5 }],
      },
    ],
  },
  [{ id: "product-1", name: "Kopi" }],
  [],
  "all",
);
assert.equal(inventoryTasks.length, 1);
assert.equal(inventoryTasks[0].canApprove, false);
assert.equal(inventoryTasks[0].requiredRole, "Owner / Business Owner");
const supplierIntent = inputActionIntentFor(
  "Tambahkan pemasok Sumber Makmur telepon: 08123456789 alamat: Jalan Merdeka 10",
);
assert.equal(supplierIntent.action, "supplier");
assert.equal(supplierIntent.values.name, "Sumber Makmur");
assert.equal(supplierIntent.values.phone, "08123456789");
assert.equal(supplierIntent.values.address, "Jalan Merdeka 10");
const vagueSupplier = inputActionIntentFor("add supplier data");
assert.equal(vagueSupplier.action, "supplier");
assert.equal(vagueSupplier.values.name, undefined);
assert.equal(inputActionIntentFor("Berapa jumlah supplier?"), null);
assert.equal(implicitInputNameFor("Tambahkan Aqua"), "Aqua");
assert.equal(heuristicInputActionForName("Aqua"), "product");
assert.equal(implicitInputNameFor("Tambah Asep"), "Asep");
assert.equal(heuristicInputActionForName("Asep"), "supplier");
assert.equal(
  implicitInputNameFor("Tambahkan stok Aqua 10 pcs"),
  null,
  "Stock movements must remain in the stock proposal workflow",
);
assert.equal(
  implicitInputNameFor("Buatkan draft PO untuk Aqua"),
  null,
  "Purchase requests must remain in the purchase proposal workflow",
);
const context = {
  outlets: [{ id: "adf115c9-7667-451e-a42a-31f925d7868a", name: "Cikedung" }],
  categories: ["Minuman"],
  selectedOutletId: "adf115c9-7667-451e-a42a-31f925d7868a",
};
const supplierTask = buildAiInputTask(
  vagueSupplier,
  context,
  "e0a797e4-3cf6-455a-900b-0aafdc53c42e",
  "9ba08836-4017-4f3d-b6cc-a6f8cd07bd1d",
);
assert.equal(supplierTask.stage, "form");
assert.equal(supplierTask.values.phone, "");
assert.throws(
  () => normalizeAiInputValues("supplier", supplierTask.values, context),
  /Nama pemasok wajib diisi/,
);
const product = normalizeAiInputValues(
  "product",
  {
    name: "Kopi Susu",
    category: "Minuman",
    variantType: "Ukuran",
    variantValue: "250 ml",
    sku: "KOPI-250",
    barcode: "",
    unit: "botol",
    price: "15000",
    cost: "8000",
    outletId: context.selectedOutletId,
    minimum: "5",
  },
  context,
);
assert.equal(product.payload.variant, "Ukuran: 250 ml");
assert.equal(product.payload.price, 15000);
assert.equal(product.payload.minimum, 5);
assert.equal(aiInputCommand("product"), "save-product");
console.log(
  "PASS: free-only routing, structured input forms, owner-only tasks, safe intents, tool-call normalization, factual fallback, and secret-free template",
);
