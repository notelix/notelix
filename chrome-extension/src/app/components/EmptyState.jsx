import React from "react";
import { Icon } from "../../ui/Icon";

export function EmptyState({ action, description, icon = "note", title }) {
  return (
    <div className="app-empty">
      <span className="app-empty__icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function LoadingRows({ count = 4 }) {
  return (
    <div aria-label="Loading" className="app-loading-rows" role="status">
      {Array.from({ length: count }, (_, index) => (
        <div className="app-loading-row" key={index}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
