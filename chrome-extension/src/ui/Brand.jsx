import React from "react";

export function Brand({ compact = false, subtitle }) {
  return (
    <div className={`nl-brand ${compact ? "nl-brand--compact" : ""}`}>
      <img className="nl-brand__mark" src="./public/logo.png" alt="" />
      <span className="nl-brand__copy">
        <span className="nl-brand__name">notelix</span>
        {subtitle && <span className="nl-brand__subtitle">{subtitle}</span>}
      </span>
    </div>
  );
}
