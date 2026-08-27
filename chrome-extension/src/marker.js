import { Marker } from "@notelix/web-marker";
import { state } from "./state";
import {
  onEditNotesElementClick,
  showEditAnnotationPopover,
  updatePopoverPosOnHighlightSelect,
} from "./dom";
import { pickBlackOrWhiteForeground } from "./utils/colors";
import commentsSvg from "./icons/comments.svg";
import { isTrustedUserInteraction } from "./trustedUserInteraction";

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
    font-size: medium !important;
    height: 26px !important;
    line-height: normal !important;
    margin: calc(1em + 10px) 0 0 !important;
    max-height: 26px !important;
    max-width: 38px !important;
    min-height: 0 !important;
    min-width: 0 !important;
    overflow: visible !important;
    padding: 0 !important;
    position: relative !important;
    transform: none !important;
    transition: filter 0.15s ease-in-out !important;
    vertical-align: baseline !important;
    width: 38px !important;
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
  clearInlineNotes(context.serializedRange.uid);
  const annotation = state.annotations[context.serializedRange.uid];
  if (annotation.data.notes) {
    const firstHighlightElement = Array.from(
      document.getElementsByTagName("web-marker-highlight")
    ).filter(
      (x) => x.getAttribute("highlight-id") === context.serializedRange.uid
    )[0];

    const inlineNotesRootElement = document.createElement("span");
    inlineNotesRootElement.id = "notes-" + context.serializedRange.uid;
    inlineNotesRootElement.className =
      "web-marker-black-listed-element notelix-notes-inline";
    inlineNotesRootElement.setAttribute("aria-label", "Edit Notelix note");
    const shadowRoot = inlineNotesRootElement.attachShadow({ mode: "closed" });
    const shadowStyle = document.createElement("style");
    shadowStyle.textContent = `
      ${inlineNoteHostStyles}
      .comments-svg { display: inline-block; width: 38px; height: 26px; }
      .comments-svg svg {
        position: relative; top: 2px; box-sizing: content-box; width: 1em;
        padding: 0 2px 0 4px; transition: transform 0.2s ease-in-out;
      }
      .comments-svg:hover svg { transform: scale(1.15); }
      .text {
        font-family: sans-serif; text-decoration: none; font-style: normal;
        font-weight: normal; white-space: nowrap; display: inline;
        padding: 4px 8px; position: absolute; z-index: 1;
        top: calc(-1em - 11px); left: 0; border-radius: 2px;
        font-size: 11px; overflow: hidden; text-overflow: ellipsis;
        line-height: 12px;
      }
      .caret {
        display: inline-block; width: 10px; height: 10px;
        transform: rotate(45deg); position: absolute; top: -9px;
        z-index: 0; left: 6px;
      }
      .expanded {
        pointer-events: none; position: fixed; left: 0; width: 100vw;
        padding: 20px; box-sizing: border-box; text-align: center;
        z-index: 2147483647;
      }
      .expanded > div {
        padding: 20px; backdrop-filter: blur(5px);
        background-color: #FFFFFFBB; box-shadow: 0 0 4px #00000055;
        border-radius: 4px; font: 16px sans-serif; color: black;
      }
    `;
    const commentsElement = document.createElement("span");
    commentsElement.className = "comments-svg";
    commentsElement.innerHTML = commentsSvg;
    commentsElement.getElementsByTagName("svg")[0].style.fill =
      annotation.data.color;
    const inlineNotesTextElement = document.createElement("span");
    inlineNotesTextElement.className = "text";
    inlineNotesTextElement.innerText = annotation.data.notes.replace(
      /\n/g,
      " "
    );
    inlineNotesTextElement.style.setProperty(
      "background",
      annotation.data.color,
      "important"
    );
    inlineNotesTextElement.style.setProperty("max-width", "300px", "important");
    inlineNotesTextElement.style.color = pickBlackOrWhiteForeground(
      annotation.data.color
    );
    const inlineNotesCaretElement = document.createElement("span");
    inlineNotesCaretElement.className = "caret";
    inlineNotesCaretElement.style.setProperty(
      "background",
      annotation.data.color,
      "important"
    );
    const expandedNotesElement = document.createElement("div");
    expandedNotesElement.className = "expanded";
    const expandedNotesTextElement = document.createElement("div");
    expandedNotesTextElement.innerText = annotation.data.notes;
    expandedNotesElement.appendChild(expandedNotesTextElement);
    shadowRoot.append(
      shadowStyle,
      commentsElement,
      inlineNotesTextElement,
      inlineNotesCaretElement
    );

    inlineNotesRootElement.addEventListener("mouseover", () => {
      const clientRect = inlineNotesTextElement.getBoundingClientRect();
      if (clientRect.top >= document.documentElement.clientHeight / 2) {
        expandedNotesElement.style.removeProperty("bottom");
        expandedNotesElement.style.top = "0px";
      } else {
        expandedNotesElement.style.removeProperty("top");
        expandedNotesElement.style.bottom = "0px";
      }
      shadowRoot.appendChild(expandedNotesElement);
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
    inlineNotesRootElement.style.backgroundColor = "transparent";
    firstHighlightElement.prepend(inlineNotesRootElement);

    // Prevent text from growing out of the screen bounds.
    const clientRect = inlineNotesTextElement.getBoundingClientRect();
    const maxRight = document.documentElement.clientWidth;
    if (clientRect.right > maxRight) {
      const diff = maxRight - clientRect.right;
      inlineNotesTextElement.style.marginLeft = diff + "px";
    }
  }
}

export const marker = new Marker({
  rootElement: document.body,
  eventHandler: {
    onHighlightClick: (context, element, event) => {
      if (!isTrustedUserInteraction(event)) {
        return;
      }
      setTimeout(() => {
        state.selectedAnnotationId = context.serializedRange.uid;
        const range = marker.deserializeRange(
          convertAnnotationToSerializedRange(
            state.annotations[state.selectedAnnotationId]
          )
        );
        updatePopoverPosOnHighlightSelect(range.getBoundingClientRect());
        showEditAnnotationPopover();
      });
    },
    onHighlightHoverStateChange: (context, element, hovering) => {
      if (hovering) {
        const inlineNotesElement = document.getElementById(
          "notes-" + context.serializedRange.uid
        );
        if (inlineNotesElement) {
          inlineNotesElement.style.zIndex = "100";
        }
        element.style.backgroundColor =
          state.annotations[context.serializedRange.uid].data.color + "44";
      } else {
        const inlineNotesElement = document.getElementById(
          "notes-" + context.serializedRange.uid
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

export { clearInlineNotes, convertAnnotationToSerializedRange };
