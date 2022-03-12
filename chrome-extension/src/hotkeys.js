import { state } from "./state";
import {
  hideAnnotatePopover,
  onDeleteAnnotationElementClick,
  onEditCommentElementClick,
  onHighlightElementClick,
} from "./dom";
import { highlighterColors } from "./utils/colors";

export function registerHotkeys() {
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.shiftKey || e.ctrlKey || e.altKey) {
      return;
    }
    if (e.code.startsWith("Digit")) {
      if (state.annotatePopoverDom.style.display === "none") {
        return;
      }
      const key = +e.code.replace("Digit", "");
      if (key > 6) {
        return;
      }
      onHighlightElementClick(highlighterColors[+key - 1]);
      hideAnnotatePopover();
      e.preventDefault();
    } else if (e.code === "Backspace") {
      if (
        state.editAnnotationPopoverDom.style.display === "none" ||
        !state.selectedAnnotationId
      ) {
        return;
      }
      onDeleteAnnotationElementClick();
      e.preventDefault();
    } else if (e.code === "Space") {
      if (
        state.editAnnotationPopoverDom.style.display === "none" ||
        !state.selectedAnnotationId
      ) {
        return;
      }
      onEditCommentElementClick();
      e.preventDefault();
    }
  });
}
