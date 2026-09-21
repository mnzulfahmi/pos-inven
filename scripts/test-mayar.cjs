const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const context = {
  exports: {},
  require(id) {
    if (id === "server-only") return {};
    return require(id);
  },
  process,
  URL,
  fetch,
  AbortSignal,
};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("lib/mayar.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  context,
);

const { isMayarInvoicePaid, mayarInvoiceAmount } = context.exports;
assert.equal(
  isMayarInvoicePaid({ status: "OPEN", transaction: { status: "PAID" } }),
  true,
);
assert.equal(isMayarInvoicePaid({ status: "OPEN" }), false);
assert.equal(mayarInvoiceAmount({ amount: 249000 }), 249000);
assert.equal(
  mayarInvoiceAmount({ items: [{ quantity: 1, rate: 99000 }] }),
  99000,
);

const source = fs.readFileSync("lib/mayar.ts", "utf8");
assert.match(source, /\/hl\/v2\/payments\/create/);
assert.match(source, /Authorization: `Bearer/);
const example = fs.readFileSync(".env.example", "utf8");
assert.ok(/^MAYAR_API_KEY=\s*$/m.test(example));
assert.ok(/^MAYAR_WEBHOOK_SECRET=\s*$/m.test(example));

const migration = fs.readFileSync(
  "migrations/20260913142021_mayar-billing.sql",
  "utf8",
);
assert.match(migration, /PAYMENT_AMOUNT_MISMATCH/);
assert.match(migration, /nusa_mayar_complete/);
console.log(
  "PASS: Mayar v2 endpoint, payment verification, secret-free env template, and atomic activation migration",
);
