import React from "react";

const OPEN_MARKER = "<em>";
const CLOSE_MARKER = "</em>";

export function SafeHighlight({ value }) {
  let highlighted = false;

  return String(value ?? "")
    .split(/(<\/?em>)/g)
    .map((part, index) => {
      if (part === OPEN_MARKER) {
        highlighted = true;
        return null;
      }
      if (part === CLOSE_MARKER) {
        highlighted = false;
        return null;
      }

      return highlighted ? (
        <em key={index}>{part}</em>
      ) : (
        <React.Fragment key={index}>{part}</React.Fragment>
      );
    });
}
