import { Marker } from "@notelix/web-marker";
import { state } from "./state";
import {
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

      if (annotation.notes) {
        element.style.backgroundColor = annotation.color + "77";
      } else {
        // element.style.backgroundColor = "initial";
        element.style.backgroundColor = annotation.color + "22";
      }
    },
  },
});
