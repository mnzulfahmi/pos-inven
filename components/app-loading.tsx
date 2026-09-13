import { Logo } from "./ui";

export function AppLoading({
  overlay = false,
  label = "Menyiapkan ruang kerja…",
}: {
  overlay?: boolean;
  label?: string;
}) {
  return (
    <div
      className={`app-loading ${overlay ? "overlay" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="app-loading-card">
        <Logo />
        <span className="app-loading-spinner" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <strong>{label}</strong>
        <p>Data usaha Anda sedang disiapkan dengan aman.</p>
      </div>
    </div>
  );
}
