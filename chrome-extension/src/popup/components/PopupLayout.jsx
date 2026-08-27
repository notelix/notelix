import React from "react";
import { useNavigate } from "react-router-dom";
import { Brand } from "../../ui/Brand";
import { Icon } from "../../ui/Icon";

export function PopupLayout({ backTo, children, eyebrow, footer, title }) {
  const navigate = useNavigate();
  return (
    <main className="popup-shell">
      <header className="popup-header">
        <Brand compact subtitle="Web highlighter" />
        <span className="popup-header__privacy">
          <Icon name="shield" size={14} /> Private by design
        </span>
      </header>
      <section className="popup-panel">
        {backTo && (
          <button
            className="popup-back"
            onClick={() => navigate(backTo)}
            type="button"
          >
            <Icon name="arrowLeft" size={16} /> Back
          </button>
        )}
        {(eyebrow || title) && (
          <div className="popup-heading">
            {eyebrow && <span className="popup-eyebrow">{eyebrow}</span>}
            {title && <h1>{title}</h1>}
          </div>
        )}
        {children}
      </section>
      {footer && <footer className="popup-footer">{footer}</footer>}
    </main>
  );
}

export function PopupLoading({ label = "Opening Notelix…" }) {
  return (
    <main className="popup-loading" role="status">
      <Brand subtitle="Web highlighter" />
      <span className="nl-spinner" />
      <p>{label}</p>
    </main>
  );
}
