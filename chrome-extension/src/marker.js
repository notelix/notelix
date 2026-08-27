import { Marker } from "@notelix/web-marker";
import { state } from "./state";
import {
  onEditNotesElementClick,
  showEditAnnotationPopover,
  updatePopoverPlacementOnHighlightSelect,
} from "./dom";
import commentsSvg from "./icons/comments.svg";
import { isTrustedUserInteraction } from "./trustedUserInteraction";
import { embeddedCopy } from "./embeddedLocale";
import { isEmbeddedDarkTheme } from "./integration/dark-reader";
import { placePopover, pointerAnchorRect } from "./utils/popoverPlacement";

const inlineNoteHostStyles = `
  :host {
    all: initial !important;
    background: transparent !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    box-sizing: border-box !important;
    cursor: pointer !important;
    display: inline-block !important;
    filter: brightness(1) !important;
    font-size: 0 !important;
    height: 16px !important;
    left: auto !important;
    line-height: 0 !important;
    margin: 0 0 0 3px !important;
    max-height: 16px !important;
    max-width: 16px !important;
    min-height: 0 !important;
    min-width: 0 !important;
    overflow: visible !important;
    padding: 0 !important;
    position: relative !important;
    top: -1px !important;
    transform: none !important;
    transition: filter 0.15s ease-in-out !important;
    vertical-align: text-top !important;
    width: 16px !important;
    z-index: 2 !important;
  }
  :host(:hover) { filter: brightness(1.05) !important; z-index: 100 !important; }
`;

function convertAnnotationToSerializedRange(annotation) {
  return {
    uid: annotation.uid,
    text: annotation.data.text,
    textBefore: annotation.data.textBefore,
    textAfter: annotation.data.textAfter,
  };
}

function paintNotes(context) {
  const uid = context.serializedRange.uid;
  const annotation = state.annotations[uid];
  const existingNotesElement = document.getElementById("notes-" + uid);
  if (!annotation.data.notes) {
    clearInlineNotes(uid);
    return;
  }
  if (annotation.data.notes) {
    const highlightElements = Array.from(
      document.getElementsByTagName("web-marker-highlight"),
    ).filter(
      (x) => x.getAttribute("highlight-id") === context.serializedRange.uid,
    );
    const lastHighlightElement = highlightElements[highlightElements.length - 1];
    if (!lastHighlightElement) return;
    if (existingNotesElement) {
      if (
        existingNotesElement.parentElement !== lastHighlightElement ||
        lastHighlightElement.lastChild !== existingNotesElement
      ) {
        lastHighlightElement.append(existingNotesElement);
      }
      return;
    }

    const inlineNotesRootElement = document.createElement("span");
    inlineNotesRootElement.id = "notes-" + context.serializedRange.uid;
    inlineNotesRootElement.className =
      "web-marker-black-listed-element notelix-notes-inline";
    inlineNotesRootElement.setAttribute("aria-label", embeddedCopy.editNote);
    inlineNotesRootElement.setAttribute("role", "button");
    inlineNotesRootElement.tabIndex = 0;
    const shadowRoot = inlineNotesRootElement.attachShadow({ mode: "closed" });
    const shadowStyle = document.createElement("style");
    shadowStyle.textContent = `
      ${inlineNoteHostStyles}
      .comments-svg {
        align-items: center; background: rgba(255, 255, 255, .84);
        border: 1px solid rgba(0, 0, 0, .28); border-radius: 4px;
        box-shadow: none; box-sizing: border-box;
        display: inline-flex; height: 16px; justify-content: center; width: 16px;
      }
      .comments-svg svg {
        box-sizing: content-box; fill: #111 !important; height: 11px;
        padding: 0; width: 11px;
      }
      :host(:hover) .comments-svg { background: rgba(255, 255, 255, .98); }
      :host(:focus-visible) .comments-svg {
        outline: 2px solid #111; outline-offset: 2px;
      }
      .expanded {
        box-sizing: border-box; pointer-events: none; position: absolute;
        left: 0; max-width: calc(100vw - 24px); width: 320px;
        z-index: 2147483647;
      }
      .expanded > div {
        background: rgba(255, 255, 255, .98); border: 1px solid #ddd;
        border-radius: 6px; box-shadow: 0 3px 12px rgba(0, 0, 0, .16);
        color: #222; font: 13px/1.6 -apple-system, BlinkMacSystemFont,
          "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        overflow-wrap: anywhere; padding: 8px 10px; text-align: left;
        white-space: pre-wrap;
      }
      :host(.dark-reader-enabled) .expanded > div {
        background: rgba(37, 37, 37, .98); border-color: #555; color: #f5f5f5;
      }
      :host(.dark-reader-enabled) .comments-svg {
        background: rgba(255, 255, 255, .84); border-color: rgba(0, 0, 0, .28);
      }
    `;
    const commentsElement = document.createElement("span");
    commentsElement.className = "comments-svg";
    commentsElement.innerHTML = commentsSvg;
    const expandedNotesElement = document.createElement("div");
    expandedNotesElement.className = "expanded";
    const expandedNotesTextElement = document.createElement("div");
    expandedNotesTextElement.innerText = annotation.data.notes;
    expandedNotesElement.appendChild(expandedNotesTextElement);
    shadowRoot.append(shadowStyle, commentsElement);

    inlineNotesRootElement.addEventListener("mouseenter", () => {
      const hostRect = inlineNotesRootElement.getBoundingClientRect();
      const tooltipWidth = Math.min(
        320,
        document.documentElement.clientWidth - 24,
      );
      expandedNotesElement.style.width = `${tooltipWidth}px`;
      expandedNotesElement.style.visibility = "hidden";
      shadowRoot.appendChild(expandedNotesElement);
      placePopover(expandedNotesElement, {
        alignment: "end",
        anchorRect: hostRect,
        coordinateOrigin: hostRect,
        gap: 8,
        preferredSide: "above",
      });
      expandedNotesElement.style.removeProperty("visibility");
    });
    inlineNotesRootElement.addEventListener("mouseleave", () => {
      expandedNotesElement.remove();
    });
    inlineNotesRootElement.addEventListener("click", (e) => {
      if (!isTrustedUserInteraction(e)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      state.selectedAnnotationId = context.serializedRange.uid;
      onEditNotesElementClick();
      expandedNotesElement.remove();
    });
    inlineNotesRootElement.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      if (!isTrustedUserInteraction(event)) return;
      event.preventDefault();
      state.selectedAnnotationId = context.serializedRange.uid;
      onEditNotesElementClick();
      expandedNotesElement.remove();
    });
    inlineNotesRootElement.style.backgroundColor = "transparent";
    if (isEmbeddedDarkTheme()) {
      inlineNotesRootElement.classList.add("dark-reader-enabled");
    }
    lastHighlightElement.append(inlineNotesRootElement);
  }
}

export const marker = new Marker({
  rootElement: document.body,
  eventHandler: {
    onHighlightClick: (context, element, event) => {
      if (!isTrustedUserInteraction(event)) {
        return;
      }
      const clickedAnchor = pointerAnchorRect(
        event,
        element.getBoundingClientRect(),
      );
      setTimeout(() => {
        state.selectedAnnotationId = context.serializedRange.uid;
        updatePopoverPlacementOnHighlightSelect(clickedAnchor);
        showEditAnnotationPopover();
      });
    },
    onHighlightHoverStateChange: (context, element, hovering) => {
      if (hovering) {
        const inlineNotesElement = document.getElementById(
          "notes-" + context.serializedRange.uid,
        );
        if (inlineNotesElement) {
          inlineNotesElement.style.zIndex = "100";
        }
        element.style.backgroundColor =
          state.annotations[context.serializedRange.uid].data.color + "44";
      } else {
        const inlineNotesElement = document.getElementById(
          "notes-" + context.serializedRange.uid,
        );
        if (inlineNotesElement) {
          inlineNotesElement.style.zIndex = "";
        }
        context.marker.highlightPainter.paintHighlight(context, element);
      }
    },
  },
  highlightPainter: {
    paintHighlight: (context, element) => {
      element.style.textDecoration = "underline";
      element.style["text-decoration-thickness"] = "2px";
      const annotation = state.annotations[context.serializedRange.uid];
      element.style.textDecorationColor = annotation.data.color;
      element.style.backgroundColor = annotation.data.color + "22";
    },
    afterPaintHighlight: (context) => {
      paintNotes(context);
    },
  },
});

function clearInlineNotes(uid) {
  const originalNotesElement = document.getElementById("notes-" + uid);
  if (originalNotesElement) {
    originalNotesElement.parentElement.removeChild(originalNotesElement);
  }
}

export { clearInlineNotes, convertAnnotationToSerializedRange, paintNotes };
