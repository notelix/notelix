import { Marker } from "@notelix/web-marker";
import { state } from "./state";
import {
  onEditCommentElementClick,
  showEditAnnotationPopover,
  updateSelectionRectAccordingToRange,
} from "./dom";

export const marker = new Marker({
  rootElement: document.body,
  eventHandler: {
    onHighlightClick: (context, element) => {
      setTimeout(() => {
        state.selectedAnnotationId = context.serializedRange.uid;
        const range = marker.deserializeRange(
          state.annotations[state.selectedAnnotationId]
        );
        updateSelectionRectAccordingToRange(range);
        showEditAnnotationPopover();
      }, 20);
    },
    onHighlightHoverStateChange: (context, element, hovering) => {
      if (hovering) {
        element.style.backgroundColor =
          state.annotations[context.serializedRange.uid].color + "44";
      } else {
        context.marker.highlightPainter.paintHighlight(context, element);
      }
    },
  },
  highlightPainter: {
    paintHighlight: (context, element) => {
      element.style.textDecoration = "underline";
      element.style["text-decoration-thickness"] = "2px";
      const annotation = state.annotations[context.serializedRange.uid];
      element.style.textDecorationColor = annotation.color;

      // element.style.backgroundColor = "initial";
      element.style.backgroundColor = annotation.color + "22";
      setTimeout(() => {
        clearInlineComments(context.serializedRange.uid);
        if (annotation.notes) {
          const firstHighlightElement = Array.from(
            document.getElementsByTagName("web-marker-highlight")
          ).filter(
            (x) =>
              x.getAttribute("highlight-id") === context.serializedRange.uid
          )[0];

          const notesElement = document.createElement("div");
          notesElement.addEventListener("click", () => {
            state.selectedAnnotationId = context.serializedRange.uid;
            onEditCommentElementClick();
          });
          notesElement.id = "notes-" + context.serializedRange.uid;
          notesElement.className =
            "web-marker-black-listed-element notelix-comments-inline";
          const notesElementNotes = document.createElement("div");
          notesElementNotes.innerText = JSON.parse(annotation.notes)[0].text;
          notesElementNotes.className = "text";
          notesElement.appendChild(notesElementNotes);
          firstHighlightElement.prepend(notesElement);

          const caret = document.createElement("div");
          caret.className = "caret";
          notesElement.appendChild(caret);
        }
      });
    },
  },
});

function clearInlineComments(uid) {
  const originalNotesElement = document.getElementById("notes-" + uid);
  if (originalNotesElement) {
    originalNotesElement.parentElement.removeChild(originalNotesElement);
  }
}

export { clearInlineComments };
