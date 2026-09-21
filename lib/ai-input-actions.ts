export type AiInputActionName =
  "supplier" | "product" | "customer" | "outlet" | "register";

export type AiInputField = {
  name: string;
  label: string;
  type: "text" | "tel" | "email" | "number" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
};

export type AiInputTask = {
  id: string;
  commandKey: string;
  action: AiInputActionName;
  title: string;
  description: string;
  fields: AiInputField[];
  values: Record<string, string>;
  stage: "form" | "review" | "completed";
  requiredRole: string;
  targetHref: "/purchases" | "/inventory" | "/customers" | "/settings";
  result?: { id?: string };
};

export type AiInputIntent = {
  action: AiInputActionName;
  values: Record<string, string>;
};

export type AiInputContext = {
  outlets: { id: string; name: string; active?: boolean }[];
  categories: string[];
  selectedOutletId?: string | null;
};

const metadata: Record<
  AiInputActionName,
  Pick<AiInputTask, "title" | "description" | "targetHref">
> = {
  supplier: {
    title: "Tambah data pemasok",
    description:
      "Lengkapi kontak pemasok. Nusa tidak akan mengarang nomor telepon atau alamat yang belum Anda berikan.",
    targetHref: "/purchases",
  },
  product: {
    title: "Tambah produk inventori",
    description:
      "Lengkapi struktur produk dan varian. Saldo awal tetap dicatat melalui opname setelah produk tersimpan.",
    targetHref: "/inventory",
  },
  customer: {
    title: "Tambah data pelanggan",
    description:
      "Lengkapi data pelanggan yang memang tersedia. Field opsional boleh dikosongkan.",
    targetHref: "/customers",
  },
  outlet: {
    title: "Tambah outlet",
    description:
      "Periksa nama, kode unik, dan alamat outlet sebelum membuatnya.",
    targetHref: "/settings",
  },
  register: {
    title: "Tambah mesin kasir",
    description:
      "Pilih outlet dan nama register yang akan digunakan saat membuka shift.",
    targetHref: "/settings",
  },
};

const writeVerb =
  /\b(tambah(?:kan)?|buat(?:kan)?|input|masukkan|catat|daftar(?:kan)?|simpan|create|add|insert|register)\b/i;

const entityPatterns: Record<AiInputActionName, RegExp> = {
  supplier: /\b(?:pemasok|supplier|vendor)\b/i,
  product: /\b(?:produk|product|barang|data\s+inventori|inventory\s+data)\b/i,
  customer: /\b(?:pelanggan|customer)\b/i,
  outlet: /\b(?:outlet|cabang|toko)\b/i,
  register: /\b(?:mesin\s+kasir|register|cash\s*register)\b/i,
};

const genericTail = new Set([
  "",
  "baru",
  "data",
  "data baru",
  "new",
  "new data",
  "ke sistem",
  "to system",
]);

const processWords =
  /\b(?:stok|stock|restock|opname|koreksi|saldo|po|purchase|pembelian|pesanan|order|terima\s+barang|penjualan|transaksi)\b/i;

const productWords =
  /\b(?:aqua|indomie|mie|mi|kopi|teh|susu|beras|minyak|gula|garam|telur|roti|air|jus|soda|sirup|snack|biskuit|sabun|sampo|shampoo|pasta\s+gigi|deterjen|sepatu|baju|kaos|celana|tas|botol|kaleng|sachet|kemasan|ml|liter|gram|kg)\b/i;

const supplierNames = new Set([
  "asep",
  "agus",
  "ahmad",
  "andi",
  "budi",
  "dedi",
  "dewi",
  "eko",
  "hendra",
  "joko",
  "rudi",
  "siti",
  "sri",
  "taufik",
  "udin",
  "wahyu",
  "yanto",
]);

function clean(value: string) {
  return value.replace(/^[\s:=-]+|[\s.,;]+$/g, "").trim();
}

function labelled(
  question: string,
  labels: string,
  stopLabels = "nama|name|telepon|telp|phone|whatsapp|wa|alamat|address|sku|barcode|kategori|category|varian|variant|unit|satuan|harga jual|price|harga modal|cost|kode|code|outlet|cabang|toko|stok minimum|minimum",
) {
  const match = question.match(
    new RegExp(
      `\\b(?:${labels})\\b\\s*(?::|=|adalah|is)?\\s*([^,;\\n]+?)(?=\\s+(?:${stopLabels})\\s*(?::|=|adalah|is)|[,;\\n]|$)`,
      "i",
    ),
  );
  return clean(match?.[1] || "");
}

function trailingName(question: string, entity: RegExp) {
  const source = entity.source;
  const labelledName = clean(
    question.match(
      new RegExp(
        `\\b(?:nama(?:\\s+(?:${source}))?|name)\\b\\s*(?::|=|adalah|is)\\s*([^,;\\n]+)`,
        "i",
      ),
    )?.[1] || "",
  );
  if (labelledName && !genericTail.has(labelledName.toLowerCase()))
    return labelledName;
  const match = question.match(
    new RegExp(
      `(?:${source})(?:\\s+(?:baru|new))?(?:\\s+(?:bernama|named))?\\s*(?::|=|-)?\\s*(.+)$`,
      "i",
    ),
  );
  const tail = clean(
    (match?.[1] || "").split(
      /\s+(?=(?:telepon|telp|phone|whatsapp|wa|alamat|address|sku|barcode|kategori|category|varian|variant|unit|satuan|harga jual|price|harga modal|cost|kode|code|stok minimum|minimum)\s*(?::|=|adalah|is))/i,
    )[0],
  );
  return genericTail.has(tail.toLowerCase()) ? "" : tail;
}

function digits(value: string) {
  return value.replace(/[^0-9]/g, "");
}

/**
 * Returns a name only for short, direct create commands which omit an entity.
 * Business-process commands remain available to the existing proposal flow.
 */
export function implicitInputNameFor(question: string) {
  if (!writeVerb.test(question) || processWords.test(question)) return null;
  if (
    (Object.keys(entityPatterns) as AiInputActionName[]).some((action) =>
      entityPatterns[action].test(question),
    )
  )
    return null;
  const command = question.trim().replace(/^(?:tolong|mohon|please)\s+/i, "");
  const match = writeVerb.exec(command);
  if (!match) return null;
  const name = clean(
    command
      .slice((match.index || 0) + match[0].length)
      .replace(/^(?:data|nama)\s+/i, ""),
  );
  if (
    !name ||
    genericTail.has(name.toLowerCase()) ||
    name.length > 160 ||
    name.split(/\s+/).length > 8
  )
    return null;
  return name;
}

/** High-confidence local hints. Unknown names are classified by the AI route. */
export function heuristicInputActionForName(
  name: string,
): "product" | "supplier" | null {
  const normalized = name.trim().toLocaleLowerCase("id-ID");
  if (!normalized) return null;
  if (productWords.test(normalized)) return "product";
  if (/^(?:pt|cv|ud|pd|bapak|pak|ibu|bu|mas|mbak)\b/i.test(normalized))
    return "supplier";
  const first = normalized.split(/\s+/)[0];
  if (supplierNames.has(first)) return "supplier";
  return null;
}

export function inputActionIntentFor(question: string): AiInputIntent | null {
  if (!writeVerb.test(question)) return null;
  const action = (
    ["supplier", "product", "customer", "register", "outlet"] as const
  ).find((candidate) => entityPatterns[candidate].test(question));
  if (!action) return null;

  const values: Record<string, string> = {};
  const name = trailingName(question, entityPatterns[action]);
  if (name) values.name = name;

  if (action === "supplier" || action === "customer") {
    const phone = labelled(
      question,
      "telepon|telp|phone|nomor\\s*(?:hp|whatsapp|wa)|whatsapp|wa",
    );
    if (phone) values.phone = phone;
  }
  if (action === "supplier" || action === "outlet") {
    const address = labelled(question, "alamat|address");
    if (address) values.address = address;
  }
  if (action === "customer") {
    const email = labelled(question, "email|e-mail");
    const note = labelled(question, "catatan|note");
    if (email) values.email = email;
    if (note) values.note = note;
  }
  if (action === "product") {
    const sku = labelled(question, "sku");
    const barcode = labelled(question, "barcode");
    const category = labelled(question, "kategori|category");
    const variantValue = labelled(question, "varian|variant");
    const unit = labelled(question, "satuan|unit");
    const price = labelled(question, "harga\\s*jual|price");
    const cost = labelled(question, "harga\\s*(?:modal|beli)|cost");
    const minimum = labelled(question, "stok\\s*minimum|minimum");
    if (sku) values.sku = sku;
    if (barcode) values.barcode = barcode;
    if (category) values.category = category;
    if (variantValue) values.variantValue = variantValue;
    if (unit) values.unit = unit;
    if (price) values.price = digits(price);
    if (cost) values.cost = digits(cost);
    if (minimum) values.minimum = digits(minimum);
  }
  if (action === "outlet") {
    const code = labelled(question, "kode|code");
    if (code) values.code = code;
  }
  return { action, values };
}

export function inputFieldsFor(
  action: AiInputActionName,
  context: AiInputContext,
): AiInputField[] {
  const outletOptions = context.outlets
    .filter((outlet) => outlet.active !== false)
    .map((outlet) => ({ value: outlet.id, label: outlet.name }));
  if (action === "supplier")
    return [
      { name: "name", label: "Nama pemasok", type: "text", required: true },
      {
        name: "phone",
        label: "Telepon / WhatsApp",
        type: "tel",
        placeholder: "Opsional",
      },
      {
        name: "address",
        label: "Alamat",
        type: "textarea",
        placeholder: "Opsional",
      },
    ];
  if (action === "customer")
    return [
      { name: "name", label: "Nama pelanggan", type: "text", required: true },
      { name: "phone", label: "Telepon", type: "tel", placeholder: "Opsional" },
      { name: "email", label: "Email", type: "email", placeholder: "Opsional" },
      {
        name: "note",
        label: "Catatan",
        type: "textarea",
        placeholder: "Opsional",
      },
    ];
  if (action === "outlet")
    return [
      { name: "name", label: "Nama outlet", type: "text", required: true },
      {
        name: "code",
        label: "Kode outlet",
        type: "text",
        required: true,
        help: "Kode unik untuk membedakan cabang.",
      },
      { name: "address", label: "Alamat", type: "textarea" },
    ];
  if (action === "register")
    return [
      { name: "name", label: "Nama mesin kasir", type: "text", required: true },
      {
        name: "outletId",
        label: "Outlet",
        type: "select",
        required: true,
        options: outletOptions,
      },
    ];
  return [
    { name: "name", label: "Nama produk", type: "text", required: true },
    {
      name: "category",
      label: "Kategori",
      type: "text",
      required: true,
      placeholder: context.categories[0] || "Lainnya",
      options: [...new Set(context.categories)]
        .filter(Boolean)
        .map((value) => ({ value, label: value })),
    },
    {
      name: "variantType",
      label: "Jenis varian",
      type: "select",
      options: [
        { value: "", label: "Tanpa varian" },
        ...[
          "Ukuran",
          "Warna",
          "Rasa",
          "Kemasan",
          "Material",
          "Model",
          "Lainnya",
        ].map((value) => ({ value, label: value })),
      ],
    },
    {
      name: "variantValue",
      label: "Nilai varian",
      type: "text",
      placeholder: "Contoh: 250 ml, Merah, atau Pedas",
    },
    { name: "sku", label: "SKU", type: "text", required: true },
    {
      name: "barcode",
      label: "Barcode",
      type: "text",
      placeholder: "Opsional",
    },
    { name: "unit", label: "Satuan", type: "text", required: true },
    {
      name: "price",
      label: "Harga jual (Rp)",
      type: "number",
      required: true,
      min: 0,
      max: 1_000_000_000,
      step: 1,
    },
    {
      name: "cost",
      label: "Biaya awal (Rp)",
      type: "number",
      required: true,
      min: 0,
      max: 1_000_000_000,
      step: 1,
    },
    {
      name: "outletId",
      label: "Outlet untuk batas stok",
      type: "select",
      options: [{ value: "", label: "Belum ditentukan" }, ...outletOptions],
    },
    {
      name: "minimum",
      label: "Stok minimum",
      type: "number",
      min: 0,
      max: 1_000_000,
      step: 1,
      help: "Memerlukan outlet jika diisi.",
    },
  ];
}

const defaults: Record<AiInputActionName, Record<string, string>> = {
  supplier: { name: "", phone: "", address: "" },
  customer: { name: "", phone: "", email: "", note: "" },
  outlet: { name: "", code: "", address: "" },
  register: { name: "", outletId: "" },
  product: {
    name: "",
    category: "Lainnya",
    variantType: "",
    variantValue: "",
    sku: "",
    barcode: "",
    unit: "unit",
    price: "",
    cost: "",
    outletId: "",
    minimum: "",
  },
};

export function buildAiInputTask(
  intent: AiInputIntent,
  context: AiInputContext,
  id: string,
  commandKey: string,
): AiInputTask {
  const values = {
    ...defaults[intent.action],
    ...(intent.action === "register" && context.selectedOutletId
      ? { outletId: context.selectedOutletId }
      : {}),
    ...(intent.action === "product" && context.selectedOutletId
      ? { outletId: context.selectedOutletId }
      : {}),
    ...intent.values,
  };
  return {
    id,
    commandKey,
    action: intent.action,
    ...metadata[intent.action],
    fields: inputFieldsFor(intent.action, context),
    values,
    stage: "form",
    requiredRole: "Owner / Business Owner",
  };
}

function textValue(
  values: Record<string, unknown>,
  name: string,
  label: string,
  options: { required?: boolean; max?: number } = {},
) {
  const value = String(values[name] ?? "").trim();
  if (options.required && !value) throw new Error(`${label} wajib diisi.`);
  if (value.length > (options.max || 500))
    throw new Error(`${label} terlalu panjang.`);
  return value;
}

function numberValue(
  values: Record<string, unknown>,
  name: string,
  label: string,
  options: { required?: boolean; max: number; integer?: boolean },
) {
  const raw = String(values[name] ?? "").trim();
  if (!raw) {
    if (options.required) throw new Error(`${label} wajib diisi.`);
    return null;
  }
  const value = Number(raw);
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > options.max ||
    (options.integer && !Number.isInteger(value))
  )
    throw new Error(`${label} tidak valid.`);
  return value;
}

export function normalizeAiInputValues(
  action: AiInputActionName,
  values: Record<string, unknown>,
  context: AiInputContext,
): { values: Record<string, string>; payload: Record<string, any> } {
  const fields = inputFieldsFor(action, context);
  const allowed = new Set(fields.map((field) => field.name));
  const safe = Object.fromEntries(
    Object.entries(values)
      .filter(([name]) => allowed.has(name))
      .map(([name, value]) => [name, String(value ?? "").trim()]),
  );
  for (const field of fields)
    if (field.required && !safe[field.name])
      throw new Error(`${field.label} wajib diisi.`);

  if (action === "supplier") {
    const name = textValue(safe, "name", "Nama pemasok", {
      required: true,
      max: 160,
    });
    const phone = textValue(safe, "phone", "Telepon", { max: 50 });
    const address = textValue(safe, "address", "Alamat", { max: 500 });
    return {
      values: { name, phone, address },
      payload: { name, phone, address },
    };
  }
  if (action === "customer") {
    const name = textValue(safe, "name", "Nama pelanggan", {
      required: true,
      max: 160,
    });
    const phone = textValue(safe, "phone", "Telepon", { max: 50 });
    const email = textValue(safe, "email", "Email", { max: 254 });
    const note = textValue(safe, "note", "Catatan", { max: 500 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("Email tidak valid.");
    return {
      values: { name, phone, email, note },
      payload: { name, phone, email, note },
    };
  }
  if (action === "outlet") {
    const name = textValue(safe, "name", "Nama outlet", {
      required: true,
      max: 160,
    });
    const code = textValue(safe, "code", "Kode outlet", {
      required: true,
      max: 80,
    });
    const address = textValue(safe, "address", "Alamat", { max: 500 });
    return {
      values: { name, code, address },
      payload: { name, code, address, active: true },
    };
  }
  if (action === "register") {
    const name = textValue(safe, "name", "Nama mesin kasir", {
      required: true,
      max: 100,
    });
    const outletId = textValue(safe, "outletId", "Outlet", {
      required: true,
      max: 36,
    });
    if (
      !context.outlets.some(
        (outlet) => outlet.id === outletId && outlet.active !== false,
      )
    )
      throw new Error("Outlet tidak tersedia.");
    return {
      values: { name, outletId },
      payload: { name, outletId, active: true },
    };
  }

  const name = textValue(safe, "name", "Nama produk", {
    required: true,
    max: 160,
  });
  const category = textValue(safe, "category", "Kategori", {
    required: true,
    max: 100,
  });
  const variantType = textValue(safe, "variantType", "Jenis varian", {
    max: 30,
  });
  const variantValue = textValue(safe, "variantValue", "Nilai varian", {
    max: 100,
  });
  if (!!variantType !== !!variantValue)
    throw new Error("Isi jenis dan nilai varian, atau kosongkan keduanya.");
  const sku = textValue(safe, "sku", "SKU", { required: true, max: 80 });
  const barcode = textValue(safe, "barcode", "Barcode", { max: 100 });
  const unit = textValue(safe, "unit", "Satuan", {
    required: true,
    max: 30,
  });
  const price = numberValue(safe, "price", "Harga jual", {
    required: true,
    max: 1_000_000_000,
    integer: true,
  })!;
  const cost = numberValue(safe, "cost", "Biaya awal", {
    required: true,
    max: 1_000_000_000,
  })!;
  const minimum = numberValue(safe, "minimum", "Stok minimum", {
    max: 1_000_000,
  });
  const outletId = textValue(safe, "outletId", "Outlet", { max: 36 });
  if (minimum !== null && !outletId)
    throw new Error("Pilih outlet untuk menyimpan stok minimum.");
  if (
    outletId &&
    !context.outlets.some(
      (outlet) => outlet.id === outletId && outlet.active !== false,
    )
  )
    throw new Error("Outlet tidak tersedia.");
  const normalizedValues = {
    name,
    category,
    variantType,
    variantValue,
    sku,
    barcode,
    unit,
    price: String(price),
    cost: String(cost),
    outletId,
    minimum: minimum === null ? "" : String(minimum),
  };
  return {
    values: normalizedValues,
    payload: {
      name,
      category,
      variant: variantType ? `${variantType}: ${variantValue}` : "Default",
      sku,
      barcode,
      unit,
      precision: 0,
      price,
      cost,
      archived: false,
      ...(outletId ? { outletId, minimum: minimum || 0 } : {}),
    },
  };
}

export function aiInputCommand(action: AiInputActionName) {
  return {
    supplier: "save-supplier",
    product: "save-product",
    customer: "save-customer",
    outlet: "save-outlet",
    register: "save-register",
  }[action];
}
