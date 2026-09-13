"use client";
import { ArrowUpRight, Download, Search } from "lucide-react";
import Link from "next/link";
import { useState, type ComponentProps } from "react";
import { useWorkspace } from "../workspace-context";
import { outlets, outletName, money } from "@/lib/demo-data";
import type { StoreId, Sale } from "@/lib/operations";
import { useBusiness } from "../business-provider";
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="ops-heading">
      <div>
        <p className="ops-eyebrow">{eyebrow}</p>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p>{description}</p>
      </div>
      <div className="ops-heading-actions">{children}</div>
    </div>
  );
}
export function DemoNote() {
  const { state } = useBusiness();
  return (
    <p className="ops-">
      {state.remote?.role} · Perubahan disimpan setelah dikonfirmasi server.
    </p>
  );
}
export function Stats({
  items,
}: {
  items: { label: string; value: React.ReactNode; hint: string }[];
}) {
  return (
    <div className="ops-stats">
      {items.map((i) => (
        <div key={i.label}>
          <span>{i.label}</span>
          <strong>{i.value}</strong>
          <small>{i.hint}</small>
        </div>
      ))}
    </div>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="ops-tabs" role="tablist">
      {items.map((i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === value}
          className={i === value ? "selected" : ""}
          onClick={() => onChange(i)}
        >
          {i}
        </button>
      ))}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Cari...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="ops-search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
export function Field({
  label,
  hint,
  hintAlign = "start",
  children,
}: {
  label: string;
  hint?: string;
  hintAlign?: "start" | "end";
  children: React.ReactNode;
}) {
  return (
    <label className="ops-field">
      <span className="ops-field-label">
        {label}
        {hint && <FieldHelp text={hint} align={hintAlign} />}
      </span>
      {children}
    </label>
  );
}
export function FieldHelp({
  text,
  align = "start",
}: {
  text: string;
  align?: "start" | "end";
}) {
  return (
    <span
      className={`ops-field-help ${align === "end" ? "align-end" : ""}`}
      tabIndex={0}
      aria-label={`Informasi: ${text}`}
    >
      i
      <span className="ops-field-tooltip" role="tooltip">
        {text}
      </span>
    </span>
  );
}
export function NumericInput({
  value,
  onValueChange,
  min,
  onBlur,
  ...props
}: Omit<ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value: number;
  onValueChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (Number.isFinite(value) ? String(value) : "");
  return (
    <input
      {...props}
      type="number"
      min={min}
      value={shown}
      onChange={(event) => {
        const raw = event.target.value;
        const next = /^-?0\d/.test(raw) ? String(Number(raw)) : raw;
        setDraft(next);
        onValueChange(next === "" ? 0 : Number(next));
      }}
      onBlur={(event) => {
        if (draft === "" || !Number.isFinite(value)) {
          const minimum = Number(min ?? 0);
          onValueChange(Number.isFinite(minimum) ? minimum : 0);
        }
        setDraft(null);
        onBlur?.(event);
      }}
    />
  );
}
export function ErrorNote({ error }: { error: string }) {
  return error ? (
    <p className="ops-error" role="alert">
      {error}
    </p>
  ) : null;
}
export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="ops-badge">{children}</span>;
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="ops-empty">{children}</div>;
}
export function StoreSelect({
  value,
  onChange,
}: {
  value: StoreId;
  onChange: (v: StoreId) => void;
}) {
  return (
    <select
      aria-label="Outlet tujuan"
      value={value}
      onChange={(e) => onChange(e.target.value as StoreId)}
    >
      {outlets
        .filter((x) => x.id !== "all")
        .map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
    </select>
  );
}
export function NeedOutlet() {
  const { setOutlet } = useWorkspace();
  return (
    <div className="panel ops-callout">
      <div>
        <h2>Pilih outlet untuk mulai beroperasi</h2>
        <p>Keranjang, shift, dan stok selalu terikat pada satu outlet.</p>
      </div>
      <button
        className="button primary"
        onClick={() =>
          setOutlet(outlets.find((o) => o.id !== "all")?.id || "all")
        }
      >
        Pilih outlet pertama <ArrowUpRight size={16} />
      </button>
    </div>
  );
}
export function csvDownload(name: string, rows: (string | number)[][]) {
  const csv =
    "\uFEFF" +
    rows
      .map((r) =>
        r
          .map(
            (v) =>
              '"' +
              String(v)
                .replace(/^[=+@\-]/, "'")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="button secondary" onClick={onClick}>
      <Download size={16} /> Ekspor CSV
    </button>
  );
}
export function Receipt({ sale }: { sale: Sale }) {
  const { state } = useBusiness();
  return (
    <div className="ops-receipt" id="-receipt">
      <strong>{state.settings.name}</strong>
      <p>{state.settings.address}</p>
      <p>
        {outletName(sale.outlet)} · {sale.id}
        <br />
        {sale.date}
      </p>
      <hr />
      {sale.lines.map((l, i) => (
        <div key={i}>
          <span>
            {l.name}
            <small>
              {l.quantity} × {money(l.price)}
            </small>
          </span>
          <b>{money(l.quantity * l.price)}</b>
        </div>
      ))}
      <hr />
      <div>
        <span>Diskon</span>
        <b>−{money(sale.discount)}</b>
      </div>
      <div>
        <span>Pajak</span>
        <b>{money(sale.tax)}</b>
      </div>
      <div>
        <strong>Total</strong>
        <strong>{money(sale.total)}</strong>
      </div>
      <div>
        <span>{sale.method}</span>
        <b>{money(sale.cash)}</b>
      </div>
      <div>
        <span>Kembalian</span>
        <b>{money(sale.cash - sale.total)}</b>
      </div>
      <p>{state.settings.receipt}</p>
      <small>STRUK DEMO · BUKAN BUKTI PEMBAYARAN</small>
    </div>
  );
}
export function FlowLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link className="button secondary" href={href}>
      {children}
      <ArrowUpRight size={15} />
    </Link>
  );
}
