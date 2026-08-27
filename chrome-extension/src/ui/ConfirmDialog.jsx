import React, { useEffect, useRef } from "react";
import { Icon } from "./Icon";

export function ConfirmDialog({
  confirmLabel = "Confirm",
  description,
  onCancel,
  onConfirm,
  open,
  pending = false,
  title,
  tone = "danger",
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !pending) onCancel();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onCancel, open, pending]);

  if (!open) return null;
  return (
    <div
      className="nl-dialog-backdrop"
      onMouseDown={() => !pending && onCancel()}
    >
      <section
        aria-describedby="nl-confirm-description"
        aria-labelledby="nl-confirm-title"
        aria-modal="true"
        className="nl-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <span className={`nl-dialog__symbol nl-dialog__symbol--${tone}`}>
          <Icon name={tone === "danger" ? "warning" : "info"} size={20} />
        </span>
        <div className="nl-dialog__copy">
          <h2 id="nl-confirm-title">{title}</h2>
          <p id="nl-confirm-description">{description}</p>
        </div>
        <div className="nl-dialog__actions">
          <button
            className="nl-button nl-button--secondary"
            disabled={pending}
            onClick={onCancel}
            ref={cancelRef}
          >
            Cancel
          </button>
          <button
            className={`nl-button nl-button--${tone}`}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending && <span className="nl-spinner nl-spinner--small" />}
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
