import { Marker } from "@notelix/web-marker";
import { state } from "./state";
import {
  onEditCommentElementClick,
  showEditAnnotationPopover,
  updateSelectionRectAccordingToRange,
} from "./dom";
import { pickBlackOrWhiteForeground } from "./utils/colors";

function convertAnnotationToSerializedRange(annotation) {
  return {
    uid: annotation.uid,
    text: annotation.data.text,
    textBefore: annotation.data.textBefore,
    textAfter: annotation.data.textAfter,
  };
}

function paintNotes(context) {
  clearInlineComments(context.serializedRange.uid);
  const annotation = state.annotations[context.serializedRange.uid];
  if (annotation.data.notes) {
    const firstHighlightElement = Array.from(
      document.getElementsByTagName("web-marker-highlight")
    ).filter(
      (x) => x.getAttribute("highlight-id") === context.serializedRange.uid
    )[0];

    const inlineNotesRootElement = document.createElement("div");
    inlineNotesRootElement.addEventListener("click", () => {
      state.selectedAnnotationId = context.serializedRange.uid;
      onEditCommentElementClick();
    });
    inlineNotesRootElement.id = "notes-" + context.serializedRange.uid;
    inlineNotesRootElement.className =
      "web-marker-black-listed-element notelix-comments-inline";
    const inlineNotesTextElement = document.createElement("div");
    inlineNotesTextElement.innerText = annotation.data.notes;
    inlineNotesTextElement.className = "text";
    inlineNotesTextElement.style.background = annotation.data.color;
    const textWidth = 300;
    inlineNotesTextElement.style.maxWidth = `${textWidth}px`;
    inlineNotesTextElement.style.color = pickBlackOrWhiteForeground(
      annotation.data.color
    );
    inlineNotesRootElement.appendChild(inlineNotesTextElement);
    firstHighlightElement.prepend(inlineNotesRootElement);

    const inlineNotesCaretElement = document.createElement("div");
    inlineNotesCaretElement.className = "caret";
    inlineNotesCaretElement.style.background = annotation.data.color;
    inlineNotesRootElement.appendChild(inlineNotesCaretElement);

    if (inlineNotesTextElement) {
      // prevent text from growing out of the screen bounds
      const clientRect = inlineNotesTextElement.getBoundingClientRect();
      const maxRight = document.documentElement.clientWidth - 20;
      if (clientRect.right > maxRight) {
        const diff = maxRight - clientRect.right;
        inlineNotesTextElement.style.marginLeft = diff + "px";
      }
    }
  }
}

export const marker = new Marker({
  rootElement: document.body,
  eventHandler: {
    onHighlightClick: (context, element) => {
      setTimeout(() => {
        state.selectedAnnotationId = context.serializedRange.uid;
        const range = marker.deserializeRange(
          convertAnnotationToSerializedRange(
            state.annotations[state.selectedAnnotationId]
          )
        );
        updateSelectionRectAccordingToRange(range);
        showEditAnnotationPopover();
      }, 20);
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

function clearInlineComments(uid) {
  const originalNotesElement = document.getElementById("notes-" + uid);
  if (originalNotesElement) {
    originalNotesElement.parentElement.removeChild(originalNotesElement);
  }
}

export { clearInlineComments, convertAnnotationToSerializedRange };
