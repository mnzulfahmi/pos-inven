"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Coffee, Milk, Soup, Wheat, Amphora, X } from "lucide-react";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`logo ${small ? "small" : ""}`}>
      <svg width="35" height="35" viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="12" fill="currentColor" />
        <path d="M11 28V12h5l8 10V12h5v16h-5l-8-10v10z" fill="white" />
      </svg>
      {!small && (
        <span>
          nusa<span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
export function ProductIcon({
  icon,
  color,
  image,
  name = "Produk",
}: {
  icon: string;
  color: string;
  image?: string;
  name?: string;
}) {
  const Icon =
    icon === "milk"
      ? Milk
      : icon === "wheat"
        ? Wheat
        : icon === "coffee"
          ? Coffee
          : icon === "soup"
            ? Soup
            : Amphora;
  return (
    <span className={`product-icon ${color}`}>
      {image ? (
        <img src={image} alt={name} loading="lazy" />
      ) : (
        <Icon size={22} strokeWidth={1.65} />
      )}
    </span>
  );
}
export function Modal({
  title,
  description,
  open,
  onOpenChange,
  children,
  wide = false,
}: {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog-content ${wide ? "wide" : ""}`}>
          <div className="dialog-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Tutup dialog">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="dialog-description">
            {description}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
