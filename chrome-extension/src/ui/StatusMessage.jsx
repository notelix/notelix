import React from "react";
import { Icon } from "./Icon";

export function StatusMessage({ children, tone = "info", title }) {
  const icon =
    tone === "danger" ? "warning" : tone === "success" ? "check" : "info";
  return (
    <div
      className={`nl-status nl-status--${tone}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      <span className="nl-status__icon">
        <Icon name={icon} size={17} />
      </span>
      <span>
        {title && <strong>{title}</strong>}
        <span>{children}</span>
      </span>
    </div>
  );
}

export function formatUiError(
  error,
  fallback = "Something went wrong. Please try again.",
) {
  const value =
    error?.response?.data?.message || error?.message || error?.toString?.();
  if (!value || value === "[object Object]") return fallback;
  return (
    String(value)
      .replace(/^RequestError\s*/i, "")
      .replace(/^\d{3}\s*/, "")
      .trim() || fallback
  );
}
